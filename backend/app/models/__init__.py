from sqlalchemy import Boolean, Column, Integer, String, Text, ForeignKey, DateTime, Float
from sqlalchemy.sql import func

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="planning")
    progress = Column(Integer, default=0)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    username = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True
    )

    email = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )

    hashed_password = Column(
        String(255),
        nullable=False
    )

    role = Column(
        String(50),
        default="viewer",
        nullable=False,
        index=True
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    role = Column(String(150), nullable=False)
    status = Column(String(50), default="offline")
    current_task = Column(Text, default="")

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(250), nullable=False)
    description = Column(Text, default="")
    status = Column(String(50), default="todo")
    priority = Column(String(50), default="medium")

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=True
    )

    agent_id = Column(
        Integer,
        ForeignKey("agents.id"),
        nullable=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    environment = Column(String(50), default="production")
    version = Column(String(50), default="v1.0.0")
    status = Column(String(50), default="pending")

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=True
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class DeploymentRun(Base):
    __tablename__ = "deployment_runs"

    id = Column(Integer, primary_key=True, index=True)

    deployment_id = Column(
        Integer,
        ForeignKey("deployments.id"),
        nullable=True,
        index=True
    )

    task_id = Column(
        Integer,
        nullable=True,
        index=True
    )

    name = Column(
        String(200),
        default=""
    )

    environment = Column(
        String(50),
        default="production"
    )

    version = Column(
        String(50),
        default="v1.0.0"
    )

    action = Column(
        String(100),
        default="deploy"
    )

    status = Column(
        String(50),
        default="pending",
        index=True
    )

    target_path = Column(
        String(500),
        default=""
    )

    service_name = Column(
        String(100),
        default=""
    )

    healthcheck_url = Column(
        String(500),
        default=""
    )

    started_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    completed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    duration_ms = Column(
        Float,
        default=0
    )

    logs = Column(
        Text,
        default=""
    )

    result_json = Column(
        Text,
        default="{}"
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class SecurityFinding(Base):
    __tablename__ = "security_findings"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(250), nullable=False)
    description = Column(Text, default="")
    severity = Column(String(50), default="low")
    status = Column(String(50), default="open")

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, default="")



# ============================================================
# ORION TASK EXECUTION HISTORY
# ============================================================

class TaskExecution(Base):
    __tablename__ = "task_executions"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    task_id = Column(
        Integer,
        nullable=False,
        index=True
    )

    agent_id = Column(
        Integer,
        nullable=True,
        index=True
    )

    task_title = Column(
        String(255),
        default=""
    )

    agent_name = Column(
        String(255),
        default=""
    )

    status = Column(
        String(50),
        default="unknown",
        index=True
    )

    executor = Column(
        String(255),
        default=""
    )

    health = Column(
        String(50),
        default=""
    )

    started_at = Column(
        DateTime(timezone=True),
        nullable=False
    )

    completed_at = Column(
        DateTime(timezone=True),
        nullable=False
    )

    duration_ms = Column(
        Float,
        default=0
    )

    cpu_percent = Column(
        Float,
        nullable=True
    )

    memory_percent = Column(
        Float,
        nullable=True
    )

    disk_percent = Column(
        Float,
        nullable=True
    )

    hostname = Column(
        String(255),
        default=""
    )

    warnings = Column(
        Text,
        default="[]"
    )

    recommendations = Column(
        Text,
        default="[]"
    )

    result_json = Column(
        Text,
        default="{}"
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )
