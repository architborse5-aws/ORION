from getpass import getpass

from app.database import SessionLocal
from app.models import User
from app.api.auth import hash_password


username = input("Username [Archit]: ").strip() or "Archit"

db = SessionLocal()

try:
    user = (
        db.query(User)
        .filter(User.username == username)
        .first()
    )

    if not user:
        raise SystemExit(
            f"ERROR: User '{username}' does not exist."
        )

    password = getpass("New password: ")
    confirm = getpass("Confirm new password: ")

    if password != confirm:
        raise SystemExit(
            "ERROR: Passwords do not match."
        )

    if len(password) < 12:
        raise SystemExit(
            "ERROR: Use at least 12 characters."
        )

    if len(password.encode("utf-8")) > 72:
        raise SystemExit(
            "ERROR: Password is too long."
        )

    user.hashed_password = hash_password(password)
    user.role = "admin"
    user.is_active = True

    db.commit()

    print()
    print("SUCCESS: Password updated")
    print("Username:", user.username)
    print("Role:", user.role)
    print("Active:", user.is_active)

finally:
    db.close()
