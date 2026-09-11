from getpass import getpass

from app.database import SessionLocal
from app.models import User
from app.api.auth import hash_password

VALID_ROLES = {"admin", "operator", "viewer"}

username = input("Username: ").strip()
email = input("Email: ").strip()
role = input("Role [viewer/operator/admin]: ").strip().lower()

if not username:
    raise SystemExit("ERROR: Username required")

if not email:
    raise SystemExit("ERROR: Email required")

if role not in VALID_ROLES:
    raise SystemExit("ERROR: Invalid role")

password = getpass("Password: ")
confirm = getpass("Confirm password: ")

if password != confirm:
    raise SystemExit("ERROR: Passwords do not match")

if len(password) < 12:
    raise SystemExit("ERROR: Use at least 12 characters")

db = SessionLocal()

try:
    if db.query(User).filter(User.username == username).first():
        raise SystemExit("ERROR: Username already exists")

    if db.query(User).filter(User.email == email).first():
        raise SystemExit("ERROR: Email already exists")

    user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        role=role,
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    print()
    print("SUCCESS: ORION user created")
    print("Username:", user.username)
    print("Role:", user.role)
    print("Active:", user.is_active)

finally:
    db.close()
