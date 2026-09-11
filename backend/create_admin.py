from getpass import getpass

from app.database import SessionLocal
from app.models import User
from app.api.auth import hash_password


def main():

    print()
    print("================================")
    print(" ORION ADMIN ACCOUNT CREATION")
    print("================================")
    print()

    username = (
        input("Username [admin]: ").strip()
        or "admin"
    )

    email = input(
        "Email: "
    ).strip()

    if not email:
        raise SystemExit(
            "ERROR: Email is required"
        )

    password = getpass(
        "Password: "
    )

    confirm = getpass(
        "Confirm password: "
    )

    if password != confirm:

        raise SystemExit(
            "ERROR: Passwords do not match"
        )

    if len(password) < 12:

        raise SystemExit(
            "ERROR: Use at least 12 characters"
        )

    if len(
        password.encode("utf-8")
    ) > 72:

        raise SystemExit(
            "ERROR: Password exceeds bcrypt limit"
        )

    db = SessionLocal()

    try:

        existing_username = (
            db.query(User)
            .filter(
                User.username == username
            )
            .first()
        )

        if existing_username:

            raise SystemExit(
                "ERROR: Username already exists"
            )

        existing_email = (
            db.query(User)
            .filter(
                User.email == email
            )
            .first()
        )

        if existing_email:

            raise SystemExit(
                "ERROR: Email already exists"
            )

        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(
                password
            ),
            role="admin",
            is_active=True,
        )

        db.add(user)
        db.commit()
        db.refresh(user)

        print()
        print(
            "SUCCESS: ORION administrator created."
        )
        print(
            f"User ID : {user.id}"
        )
        print(
            f"Username: {user.username}"
        )
        print(
            f"Role    : {user.role}"
        )

    finally:
        db.close()


if __name__ == "__main__":
    main()
