import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


load_dotenv()

router = APIRouter()

JWT_SECRET = os.getenv("ORION_JWT_SECRET")

if not JWT_SECRET:
    raise RuntimeError("ORION_JWT_SECRET is not configured")

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(
    os.getenv("ORION_JWT_MINUTES", "60")
)

bearer_scheme = HTTPBearer(
    auto_error=False
)


# ============================================================
# REQUEST / RESPONSE MODELS
# ============================================================

class LoginRequest(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=100
    )

    password: str = Field(
        min_length=1,
        max_length=200
    )


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user: dict


# ============================================================
# PASSWORD SECURITY
# ============================================================

def hash_password(password: str) -> str:

    password_bytes = password.encode("utf-8")

    if len(password_bytes) > 72:
        raise ValueError(
            "Password is too long for bcrypt"
        )

    salt = bcrypt.gensalt(rounds=12)

    hashed = bcrypt.hashpw(
        password_bytes,
        salt
    )

    return hashed.decode("utf-8")


def verify_password(
    password: str,
    hashed_password: str
) -> bool:

    try:

        return bcrypt.checkpw(
            password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )

    except Exception:

        return False


# ============================================================
# JWT
# ============================================================

def create_access_token(user: User) -> str:

    now = datetime.now(timezone.utc)

    expires = now + timedelta(
        minutes=JWT_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user.id),
        "username": user.username,
        "role": user.role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )


def decode_access_token(token: str):

    try:

        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM]
        )

        if payload.get("type") != "access":
            raise HTTPException(
                status_code=401,
                detail="Invalid token type"
            )

        return payload

    except JWTError:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )


# ============================================================
# CURRENT USER
# ============================================================

def get_current_user(
    credentials: Optional[
        HTTPAuthorizationCredentials
    ] = Depends(bearer_scheme),

    db: Session = Depends(get_db),
):

    if not credentials:

        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    payload = decode_access_token(
        credentials.credentials
    )

    try:
        user_id = int(
            payload.get("sub")
        )
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token"
        )

    user = db.get(
        User,
        user_id
    )

    if not user:

        raise HTTPException(
            status_code=401,
            detail="User no longer exists"
        )

    if not user.is_active:

        raise HTTPException(
            status_code=403,
            detail="User account is disabled"
        )

    return user


# ============================================================
# ROLE AUTHORIZATION
# ============================================================

def require_roles(*allowed_roles):

    allowed = {
        role.lower()
        for role in allowed_roles
    }

    def role_checker(
        user: User = Depends(
            get_current_user
        )
    ):

        if (
            (user.role or "").lower()
            not in allowed
        ):

            raise HTTPException(
                status_code=403,
                detail=(
                    "You do not have permission "
                    "to perform this action"
                )
            )

        return user

    return role_checker


# ============================================================
# LOGIN
# ============================================================

@router.post(
    "/login",
    response_model=TokenResponse
)
def login(
    data: LoginRequest,
    db: Session = Depends(get_db),
):

    user = (
        db.query(User)
        .filter(
            User.username == data.username
        )
        .first()
    )

    if (
        not user
        or not verify_password(
            data.password,
            user.hashed_password
        )
    ):

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    if not user.is_active:

        raise HTTPException(
            status_code=403,
            detail="User account is disabled"
        )

    token = create_access_token(
        user
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": (
            JWT_EXPIRE_MINUTES * 60
        ),
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "is_active": user.is_active,
        }
    }


# ============================================================
# CURRENT USER PROFILE
# ============================================================

@router.get("/me")
def auth_me(
    user: User = Depends(
        get_current_user
    )
):

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": (
            user.created_at.isoformat()
            if user.created_at
            else None
        ),
    }


@router.get("/health")
def auth_health():

    return {
        "status": "healthy",
        "service": "ORION Authentication",
        "algorithm": JWT_ALGORITHM,
    }
