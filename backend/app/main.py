from app.api.auth import router as auth_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.crud import router as crud_router
from app.api.monitoring import router as monitoring_router
from app.database import Base, engine

import app.models


app = FastAPI(
    title="ORION API",
    description="Autonomous Digital Company Operating System",
    version="1.0.0",
)


# ============================================================
# DATABASE
# ============================================================

Base.metadata.create_all(bind=engine)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# ROUTERS
# ============================================================

app.include_router(
    crud_router,
    prefix="/api",
    tags=["ORION"]
)

app.include_router(
    monitoring_router,
    prefix="/api"
)


# ============================================================
# ROOT
# ============================================================


# ORION AUTHENTICATION API
app.include_router(
    auth_router,
    prefix="/api/auth",
    tags=["Authentication"]
)

@app.get("/")
def root():
    return {
        "name": "ORION",
        "full_name": "Autonomous Digital Company Operating System",
        "version": "1.0.0",
        "status": "online",
        "message": "ORION Command Center is operational",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "ORION API",
    }
