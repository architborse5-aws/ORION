from app.database import Base, engine
import app.models

print("Creating ORION database tables...")

Base.metadata.create_all(bind=engine)

print("ORION database tables created successfully.")
