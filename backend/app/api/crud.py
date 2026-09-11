from datetime import datetime, timezone
import json
import re
import subprocess
import shutil
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
import socket
import time
import psutil
import platform
from app.database import get_db
from app.api.auth import require_roles, get_current_user
from app.models import (
    Project,
    Agent,
    Task,
    Deployment,
    DeploymentRun,
    SecurityFinding,
    Setting,
    TaskExecution,
)

router = APIRouter()


# ============================================================
# SCHEMAS
# ============================================================

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    status: str = "planning"
    progress: int = Field(default=0, ge=0, le=100)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = Field(default=None, ge=0, le=100)


class AgentCreate(BaseModel):
    name: str
    role: str
    status: str = "offline"
    current_task: str = ""


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    current_task: Optional[str] = None


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "todo"
    priority: str = "medium"
    project_id: Optional[int] = None
    agent_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    project_id: Optional[int] = None
    agent_id: Optional[int] = None


class DeploymentCreate(BaseModel):
    name: str
    environment: str = "production"
    version: str = "v1.0.0"
    status: str = "pending"
    project_id: Optional[int] = None


class DeploymentUpdate(BaseModel):
    name: Optional[str] = None
    environment: Optional[str] = None
    version: Optional[str] = None
    status: Optional[str] = None
    project_id: Optional[int] = None


class SecurityCreate(BaseModel):
    title: str
    description: str = ""
    severity: str = "low"
    status: str = "open"


class SecurityUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None


class SettingCreate(BaseModel):
    key: str
    value: str = ""


class SettingUpdate(BaseModel):
    value: str


# ============================================================
# PROJECTS
# ============================================================

@router.get("/projects")
def get_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.id.desc()).all()


@router.post("/projects", dependencies=[Depends(require_roles("admin"))])
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(**data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/projects/{project_id}", dependencies=[Depends(require_roles("admin"))])
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)

    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", dependencies=[Depends(require_roles("admin"))])
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(project)
    db.commit()

    return {"message": "Project deleted"}


# ============================================================
# AI EMPLOYEES
# ============================================================

@router.get("/agents")
def get_agents(db: Session = Depends(get_db)):
    return db.query(Agent).order_by(Agent.id.desc()).all()


@router.post("/agents", dependencies=[Depends(require_roles("admin"))])
def create_agent(data: AgentCreate, db: Session = Depends(get_db)):
    agent = Agent(**data.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.put("/agents/{agent_id}", dependencies=[Depends(require_roles("admin"))])
def update_agent(agent_id: int, data: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(agent, key, value)

    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/agents/{agent_id}", dependencies=[Depends(require_roles("admin"))])
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.get(Agent, agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    db.delete(agent)
    db.commit()

    return {"message": "Agent deleted"}


# ============================================================
# TASKS
# ============================================================

@router.get("/tasks")
def get_tasks(db: Session = Depends(get_db)):
    return db.query(Task).order_by(Task.id.desc()).all()


@router.post("/tasks", dependencies=[Depends(require_roles("admin"))])
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/tasks/{task_id}", dependencies=[Depends(require_roles("admin"))])
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", dependencies=[Depends(require_roles("admin"))])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()

    return {"message": "Task deleted"}




# ============================================================
# ORION TASK EXECUTION ENGINE + PERMANENT HISTORY
# ============================================================


def save_task_execution(
    db,
    task,
    agent,
    execution_status,
    executor,
    started_at,
    started_timer,
    result=None,
    health="",
):
    """
    Save one permanent ORION task execution report.
    """

    completed_at = datetime.now(timezone.utc)

    duration_ms = round(
        (time.perf_counter() - started_timer) * 1000,
        2
    )

    result = result or {}

    cpu = result.get("cpu", {})
    memory = result.get("memory", {})
    disk = result.get("disk", {})
    system = result.get("system", {})

    warnings = result.get(
        "warnings",
        []
    )

    recommendations = result.get(
        "recommendations",
        []
    )

    execution = TaskExecution(

        task_id=task.id,

        agent_id=(
            agent.id
            if agent
            else None
        ),

        task_title=(
            task.title or ""
        ),

        agent_name=(
            agent.name
            if agent
            else "ORION System"
        ),

        status=execution_status,

        executor=executor,

        health=health,

        started_at=started_at,

        completed_at=completed_at,

        duration_ms=duration_ms,

        cpu_percent=(
            cpu.get("usage_percent")
        ),

        memory_percent=(
            memory.get("usage_percent")
        ),

        disk_percent=(
            disk.get("usage_percent")
        ),

        hostname=(
            system.get(
                "hostname",
                ""
            )
        ),

        warnings=json.dumps(
            warnings
        ),

        recommendations=json.dumps(
            recommendations
        ),

        result_json=json.dumps(
            result
        )
    )

    db.add(execution)
    db.commit()
    db.refresh(execution)

    return execution




# ============================================================
# ORION MULTI-EXECUTOR ENGINE V1
# ============================================================

def safe_run_command(command, timeout=5):
    """
    Run a whitelisted local command safely.
    No shell=True is used.
    """
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

        return {
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }

    except subprocess.TimeoutExpired:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": "Command timed out",
        }

    except Exception as exc:
        return {
            "returncode": -1,
            "stdout": "",
            "stderr": str(exc),
        }


def detect_executor(task):
    text_value = (
        f"{task.title or ''} "
        f"{task.description or ''}"
    ).lower()

    keyword_groups = {
        "nginx_health": [
            "nginx",
            "reverse proxy",
            "web server",
        ],

        "postgres_health": [
            "postgres",
            "postgresql",
            "database health",
            "database check",
            "db health",
        ],

        "api_health": [
            "api",
            "fastapi",
            "orion api",
            "backend health",
            "endpoint",
        ],

        "process_analysis": [
            "process",
            "processes",
            "running services",
            "running process",
            "service analysis",
        ],

        "storage_analysis": [
            "storage",
            "disk",
            "filesystem",
            "volume",
            "space",
        ],

        "network_diagnostics": [
            "network",
            "port",
            "ports",
            "socket",
            "connectivity",
        ],

        "security_audit": [
            "security",
            "audit",
            "hardening",
            "firewall",
            "exposed port",
            "open port",
        ],

        "system_health": [
            "health",
            "server",
            "ec2",
            "system",
            "cpu",
            "memory",
            "ram",
            "infrastructure",
        ],

        "provisioning": [
            "provision new",
            "create new project",
            "create a new project",
            "create ai employee",
            "create a new ai employee",
            "create new ai employee",
            "create employee",
            "new employee",
            "create deployment",
            "create new deployment",
            "new deployment",
        ],
    }

    # More specific executors first
    order = [
        "provisioning",
        "nginx_health",
        "postgres_health",
        "api_health",
        "process_analysis",
        "security_audit",
        "network_diagnostics",
        "storage_analysis",
        "system_health",
    ]

    for executor_name in order:
        for keyword in keyword_groups[executor_name]:
            if keyword in text_value:
                return executor_name

    return None


def execute_system_health():
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()

    try:
        load1, load5, load15 = os.getloadavg()
    except Exception:
        load1 = load5 = load15 = 0

    warnings = []
    recommendations = []

    cpu_usage = psutil.cpu_percent(interval=0.5)

    if cpu_usage >= 90:
        warnings.append("Critical CPU usage detected")
        recommendations.append("Investigate high CPU consuming processes")
    elif cpu_usage >= 75:
        warnings.append("High CPU usage detected")
        recommendations.append("Review active workloads and CPU usage")

    if memory.percent >= 90:
        warnings.append("Critical memory usage detected")
        recommendations.append("Investigate memory-consuming services")
    elif memory.percent >= 75:
        warnings.append("High memory usage detected")
        recommendations.append("Review memory utilization")

    if disk.percent >= 90:
        warnings.append("Critical disk usage detected")
        recommendations.append("Clean disk or increase storage capacity")
    elif disk.percent >= 80:
        warnings.append("High disk usage detected")
        recommendations.append("Review filesystem storage usage")

    if not recommendations:
        recommendations.append("No immediate action required")

    return {
        "health": "warning" if warnings else "healthy",
        "executor": "system_health",
        "system": {
            "hostname": socket.gethostname(),
            "platform": platform.system(),
            "platform_release": platform.release(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
        },
        "cpu": {
            "cores": psutil.cpu_count(),
            "physical_cores": psutil.cpu_count(logical=False),
            "usage_percent": cpu_usage,
        },
        "memory": {
            "total_gb": round(memory.total / (1024 ** 3), 2),
            "used_gb": round(memory.used / (1024 ** 3), 2),
            "available_gb": round(memory.available / (1024 ** 3), 2),
            "usage_percent": memory.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024 ** 3), 2),
            "used_gb": round(disk.used / (1024 ** 3), 2),
            "free_gb": round(disk.free / (1024 ** 3), 2),
            "usage_percent": disk.percent,
        },
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_received": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_received": net.packets_recv,
        },
        "load_average": {
            "1_min": round(load1, 2),
            "5_min": round(load5, 2),
            "15_min": round(load15, 2),
        },
        "uptime": {
            "seconds": int(time.time() - psutil.boot_time()),
            "formatted": format_uptime(time.time() - psutil.boot_time()),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_nginx_health():
    warnings = []
    recommendations = []

    service = safe_run_command([
        "systemctl",
        "is-active",
        "nginx",
    ])

    nginx_active = service["stdout"] == "active"

    config_test = safe_run_command([
        "nginx",
        "-t",
    ])

    config_output = (
        config_test["stderr"]
        or config_test["stdout"]
        or ""
    )

    permission_limited = (
        "Permission denied" in config_output
        and "syntax is ok" in config_output
    )

    config_ok = (
        config_test["returncode"] == 0
        or permission_limited
    )

    port_open = False
    latency_ms = None

    started = time.perf_counter()

    try:
        with socket.create_connection(
            ("127.0.0.1", 80),
            timeout=2
        ):
            port_open = True

        latency_ms = round(
            (time.perf_counter() - started) * 1000,
            2
        )

    except Exception:
        port_open = False

    if not nginx_active:
        warnings.append("Nginx service is not active")
        recommendations.append("Start or restart the Nginx service")

    if not config_ok:
        warnings.append("Nginx configuration test failed")
        recommendations.append("Review nginx configuration syntax")

    if not port_open:
        warnings.append("Nginx is not accepting connections on port 80")
        recommendations.append("Check Nginx listener and firewall configuration")

    if not recommendations:
        recommendations.append("Nginx is operating normally")

    return {
        "health": "healthy" if nginx_active and config_ok and port_open else "warning",
        "executor": "nginx_health",
        "nginx": {
            "service_active": nginx_active,
            "config_valid": config_ok,
            "port_80_open": port_open,
            "latency_ms": latency_ms,
            "config_output": config_output,
        },
        "system": {
            "hostname": socket.gethostname(),
            "platform": platform.system(),
            "architecture": platform.machine(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_postgres_health(db):
    warnings = []
    recommendations = []

    db_ok = False
    latency_ms = None
    version = None

    try:
        started = time.perf_counter()

        db.execute(text("SELECT 1"))

        latency_ms = round(
            (time.perf_counter() - started) * 1000,
            2
        )

        db_ok = True

        version_row = db.execute(
            text("SELECT version()")
        ).fetchone()

        if version_row:
            version = version_row[0]

    except Exception as exc:
        db.rollback()
        warnings.append(f"Database health check failed: {exc}")
        recommendations.append("Review PostgreSQL service and database connectivity")

    service = safe_run_command([
        "systemctl",
        "is-active",
        "postgresql",
    ])

    service_active = service["stdout"] == "active"

    if not service_active:
        warnings.append("PostgreSQL service is not active")
        recommendations.append("Start or investigate PostgreSQL service")

    if db_ok and service_active and not recommendations:
        recommendations.append("PostgreSQL is operating normally")

    return {
        "health": "healthy" if db_ok and service_active else "warning",
        "executor": "postgres_health",
        "database": {
            "connection_ok": db_ok,
            "service_active": service_active,
            "latency_ms": latency_ms,
            "version": version,
        },
        "system": {
            "hostname": socket.gethostname(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_api_health():
    warnings = []
    recommendations = []

    port_open = False
    latency_ms = None

    started = time.perf_counter()

    try:
        with socket.create_connection(
            ("127.0.0.1", 9000),
            timeout=2
        ):
            port_open = True

        latency_ms = round(
            (time.perf_counter() - started) * 1000,
            2
        )

    except Exception:
        port_open = False

    service = safe_run_command([
        "systemctl",
        "is-active",
        "orion",
    ])

    service_active = service["stdout"] == "active"

    if not service_active:
        warnings.append("ORION FastAPI systemd service is not active")
        recommendations.append("Review or restart orion.service")

    if not port_open:
        warnings.append("FastAPI is not listening on port 9000")
        recommendations.append("Check Uvicorn startup and application logs")

    if service_active and port_open:
        recommendations.append("ORION API is operating normally")

    return {
        "health": "healthy" if service_active and port_open else "warning",
        "executor": "api_health",
        "api": {
            "service_active": service_active,
            "port_9000_open": port_open,
            "latency_ms": latency_ms,
        },
        "system": {
            "hostname": socket.gethostname(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_process_analysis():
    warnings = []
    recommendations = []

    processes = []

    for proc in psutil.process_iter([
        "pid",
        "name",
        "username",
        "memory_percent",
        "cpu_percent",
    ]):
        try:
            info = proc.info

            processes.append({
                "pid": info.get("pid"),
                "name": info.get("name"),
                "username": info.get("username"),
                "cpu_percent": round(info.get("cpu_percent") or 0, 2),
                "memory_percent": round(info.get("memory_percent") or 0, 2),
            })

        except (
            psutil.NoSuchProcess,
            psutil.AccessDenied,
        ):
            continue

    top_memory = sorted(
        processes,
        key=lambda item: item["memory_percent"],
        reverse=True
    )[:10]

    top_cpu = sorted(
        processes,
        key=lambda item: item["cpu_percent"],
        reverse=True
    )[:10]

    total_processes = len(processes)

    if total_processes > 250:
        warnings.append("Large number of running processes detected")
        recommendations.append("Review unnecessary background services")
    else:
        recommendations.append("Process count appears normal")

    return {
        "health": "warning" if warnings else "healthy",
        "executor": "process_analysis",
        "processes": {
            "total": total_processes,
            "top_cpu": top_cpu,
            "top_memory": top_memory,
        },
        "system": {
            "hostname": socket.gethostname(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_storage_analysis():
    warnings = []
    recommendations = []

    partitions = []

    for partition in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(
                partition.mountpoint
            )

            partitions.append({
                "device": partition.device,
                "mountpoint": partition.mountpoint,
                "filesystem": partition.fstype,
                "total_gb": round(usage.total / (1024 ** 3), 2),
                "used_gb": round(usage.used / (1024 ** 3), 2),
                "free_gb": round(usage.free / (1024 ** 3), 2),
                "usage_percent": usage.percent,
            })

            if usage.percent >= 90:
                warnings.append(
                    f"Critical storage usage on {partition.mountpoint}: {usage.percent}%"
                )
            elif usage.percent >= 80:
                warnings.append(
                    f"High storage usage on {partition.mountpoint}: {usage.percent}%"
                )

        except PermissionError:
            continue

    if warnings:
        recommendations.append("Clean unused files or increase volume capacity")
    else:
        recommendations.append("Storage utilization is within acceptable limits")

    root = psutil.disk_usage("/")

    return {
        "health": "warning" if warnings else "healthy",
        "executor": "storage_analysis",
        "disk": {
            "total_gb": round(root.total / (1024 ** 3), 2),
            "used_gb": round(root.used / (1024 ** 3), 2),
            "free_gb": round(root.free / (1024 ** 3), 2),
            "usage_percent": root.percent,
        },
        "partitions": partitions,
        "system": {
            "hostname": socket.gethostname(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_network_diagnostics():
    warnings = []
    recommendations = []

    connections = []

    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.status == psutil.CONN_LISTEN:
                local_address = None

                if conn.laddr:
                    local_address = f"{conn.laddr.ip}:{conn.laddr.port}"

                connections.append({
                    "address": local_address,
                    "pid": conn.pid,
                    "status": conn.status,
                })

    except psutil.AccessDenied:
        warnings.append("Limited permissions prevented full network inspection")

    interfaces = {}

    for name, addresses in psutil.net_if_addrs().items():
        interfaces[name] = []

        for address in addresses:
            interfaces[name].append({
                "family": str(address.family),
                "address": address.address,
            })

    important_ports = {
        "nginx": 80,
        "fastapi": 9000,
        "postgresql": 5432,
    }

    port_status = {}

    for name, port in important_ports.items():
        try:
            with socket.create_connection(
                ("127.0.0.1", port),
                timeout=1
            ):
                port_status[name] = {
                    "port": port,
                    "reachable": True,
                }

        except Exception:
            port_status[name] = {
                "port": port,
                "reachable": False,
            }

    if not port_status["nginx"]["reachable"]:
        warnings.append("Nginx port 80 is not reachable locally")

    if not port_status["fastapi"]["reachable"]:
        warnings.append("FastAPI port 9000 is not reachable locally")

    if not port_status["postgresql"]["reachable"]:
        warnings.append("PostgreSQL port 5432 is not reachable locally")

    if warnings:
        recommendations.append("Review service listeners and local network configuration")
    else:
        recommendations.append("Core ORION network services are reachable")

    return {
        "health": "warning" if warnings else "healthy",
        "executor": "network_diagnostics",
        "network": {
            "interfaces": interfaces,
            "listening_connections": connections[:50],
            "important_ports": port_status,
        },
        "system": {
            "hostname": socket.gethostname(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }


def execute_security_audit():
    warnings = []
    recommendations = []
    checks = {}

    # SSH
    ssh_service = safe_run_command([
        "systemctl",
        "is-active",
        "sshd",
    ])

    checks["ssh_service_active"] = (
        ssh_service["stdout"] == "active"
    )

    # Nginx
    nginx_service = safe_run_command([
        "systemctl",
        "is-active",
        "nginx",
    ])

    checks["nginx_service_active"] = (
        nginx_service["stdout"] == "active"
    )

    # ORION backend binding
    checks["fastapi_private_binding"] = False

    try:
        for conn in psutil.net_connections(kind="inet"):
            if (
                conn.status == psutil.CONN_LISTEN
                and conn.laddr
                and conn.laddr.port == 9000
            ):
                checks["fastapi_private_binding"] = (
                    conn.laddr.ip
                    in (
                        "127.0.0.1",
                        "::1",
                    )
                )

    except psutil.AccessDenied:
        checks["fastapi_private_binding"] = None

    # PostgreSQL local exposure check
    checks["postgres_private_binding"] = True

    try:
        for conn in psutil.net_connections(kind="inet"):
            if (
                conn.status == psutil.CONN_LISTEN
                and conn.laddr
                and conn.laddr.port == 5432
            ):
                if conn.laddr.ip in (
                    "0.0.0.0",
                    "::",
                ):
                    checks["postgres_private_binding"] = False

    except psutil.AccessDenied:
        checks["postgres_private_binding"] = None

    if checks["fastapi_private_binding"] is False:
        warnings.append("FastAPI may be listening on a public interface")
        recommendations.append("Bind Uvicorn to 127.0.0.1 only")

    if checks["postgres_private_binding"] is False:
        warnings.append("PostgreSQL may be listening publicly")
        recommendations.append("Restrict PostgreSQL to localhost or private networking")

    env_path = Path("/home/ec2-user/orion/backend/.env")

    checks["env_exists"] = env_path.exists()

    if env_path.exists():
        try:
            mode = oct(env_path.stat().st_mode & 0o777)
            checks["env_permissions"] = mode

            if mode not in ("0o600", "0o640"):
                warnings.append(
                    f".env permissions are {mode}"
                )
                recommendations.append(
                    "Consider chmod 600 backend/.env"
                )

        except Exception:
            pass

    if not warnings:
        recommendations.append("No obvious local configuration risks detected")

    return {
        "health": "warning" if warnings else "healthy",
        "executor": "security_audit",
        "security": checks,
        "system": {
            "hostname": socket.gethostname(),
        },
        "warnings": warnings,
        "recommendations": recommendations,
    }




# ============================================================
# ORION PROVISIONING EXECUTOR V1
# ============================================================

def execute_provisioning(db, task):

    text_value = (
        f"{task.title}\n"
        f"{task.description or ''}"
    )


    project_match = re.search(
        r"project\s+named\s+(.+?)(?:\.|\n|$)",
        text_value,
        re.IGNORECASE
    )


    agent_match = re.search(
        r"(?:AI\s+employee|employee|agent)"
        r"\s+named\s+(.+?)"
        r"\s+with\s+role\s+(.+?)(?:\.|\n|$)",
        text_value,
        re.IGNORECASE
    )


    deployment_match = re.search(
        r"deployment\s+named\s+(.+?)"
        r"\s+with\s+version\s+([^\s]+)",
        text_value,
        re.IGNORECASE
    )


    if not project_match:
        raise ValueError(
            "Project name not found in provisioning task"
        )


    if not agent_match:
        raise ValueError(
            "AI employee name/role not found in provisioning task"
        )


    if not deployment_match:
        raise ValueError(
            "Deployment name/version not found in provisioning task"
        )


    project_name = (
        project_match
        .group(1)
        .strip()
    )


    agent_name = (
        agent_match
        .group(1)
        .strip()
    )


    agent_role = (
        agent_match
        .group(2)
        .strip()
    )


    deployment_name = (
        deployment_match
        .group(1)
        .strip()
    )


    deployment_version = (
        deployment_match
        .group(2)
        .strip()
        .rstrip(".")
    )


    lower_text = text_value.lower()


    if "production deployment" in lower_text:
        environment = "production"

    elif "staging deployment" in lower_text:
        environment = "staging"

    else:
        environment = "development"


    created = {
        "project": False,
        "agent": False,
        "deployment": False,
    }


    # ========================================================
    # PROJECT
    # ========================================================

    project = (
        db.query(Project)
        .filter(
            Project.name == project_name
        )
        .first()
    )


    if not project:

        project = Project(
            name=project_name,
            description=(
                "Provisioned automatically by "
                "ORION Provisioning Executor"
            ),
            status="active",
            progress=0,
        )

        db.add(project)
        db.flush()

        created["project"] = True


    # ========================================================
    # AI EMPLOYEE
    # ========================================================

    agent = (
        db.query(Agent)
        .filter(
            Agent.name == agent_name
        )
        .first()
    )


    if not agent:

        agent = Agent(
            name=agent_name,
            role=agent_role,
            status="online",
            current_task="",
        )

        db.add(agent)
        db.flush()

        created["agent"] = True


    # ========================================================
    # DEPLOYMENT
    # ========================================================

    deployment = (
        db.query(Deployment)
        .filter(
            Deployment.name == deployment_name
        )
        .first()
    )


    if not deployment:

        deployment = Deployment(
            name=deployment_name,
            environment=environment,
            version=deployment_version,
            status="pending",
            project_id=project.id,
        )

        db.add(deployment)
        db.flush()

        created["deployment"] = True


    else:

        deployment.environment = environment
        deployment.version = deployment_version
        deployment.project_id = project.id


    return {
        "health": "healthy",
        "executor": "provisioning",

        "provisioning": {

            "project": {
                "id": project.id,
                "name": project.name,
                "created": created["project"],
            },

            "agent": {
                "id": agent.id,
                "name": agent.name,
                "role": agent.role,
                "created": created["agent"],
            },

            "deployment": {
                "id": deployment.id,
                "name": deployment.name,
                "environment": deployment.environment,
                "version": deployment.version,
                "project_id": deployment.project_id,
                "created": created["deployment"],
            },
        },

        "system": {
            "hostname": socket.gethostname()
        },

        "warnings": [],

        "recommendations": [
            "Provisioning completed successfully"
        ],
    }


@router.post("/tasks/{task_id}/run", dependencies=[Depends(require_roles("operator", "admin"))])
def run_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Task not found"
        )

    agent = None

    if task.agent_id:
        agent = db.get(
            Agent,
            task.agent_id
        )

    started_at = datetime.now(timezone.utc)
    started_timer = time.perf_counter()

    if agent:
        agent.status = "working"
        agent.current_task = task.title

    task.status = "in_progress"

    db.commit()

    executor_name = detect_executor(task)

    if (
        executor_name == "provisioning"
        and
        (current_user.role or "").lower() != "admin"
    ):
        task.status = "blocked"

        if agent:
            agent.status = "online"
            agent.current_task = ""

        db.commit()

        raise HTTPException(
            status_code=403,
            detail="Provisioning tasks require admin role"
        )

    try:

        if executor_name == "provisioning":
            result = execute_provisioning(
                db,
                task
            )

        elif executor_name == "system_health":
            result = execute_system_health()

        elif executor_name == "nginx_health":
            result = execute_nginx_health()

        elif executor_name == "postgres_health":
            result = execute_postgres_health(db)

        elif executor_name == "api_health":
            result = execute_api_health()

        elif executor_name == "process_analysis":
            result = execute_process_analysis()

        elif executor_name == "storage_analysis":
            result = execute_storage_analysis()

        elif executor_name == "network_diagnostics":
            result = execute_network_diagnostics()

        elif executor_name == "security_audit":
            result = execute_security_audit()

        else:
            task.status = "blocked"

            if agent:
                agent.status = "online"
                agent.current_task = ""

            db.commit()

            result = {
                "health": "blocked",
                "executor": "none",
                "warnings": [
                    "No approved executor matched this task"
                ],
                "recommendations": [
                    "Use a supported infrastructure, database, API, process, storage, network, Nginx, or security task"
                ],
            }

            execution = save_task_execution(
                db=db,
                task=task,
                agent=agent,
                execution_status="unsupported",
                executor="none",
                started_at=started_at,
                started_timer=started_timer,
                result=result,
                health="blocked",
            )

            return {
                "message": "Task blocked",
                "task_id": task.id,
                "execution_id": execution.id,
                "executor": "none",
                "result": result,
            }


        task.status = "completed"

        if agent:
            agent.status = "online"
            agent.current_task = ""

        db.commit()

        execution = save_task_execution(
            db=db,
            task=task,
            agent=agent,
            execution_status="success",
            executor=executor_name,
            started_at=started_at,
            started_timer=started_timer,
            result=result,
            health=result.get(
                "health",
                "unknown"
            ),
        )

        return {
            "message": "Task completed",
            "task_id": task.id,
            "execution_id": execution.id,
            "executor": executor_name,
            "result": result,
        }


    except Exception as exc:

        db.rollback()

        task = db.get(
            Task,
            task_id
        )

        if task:
            task.status = "blocked"

        agent = None

        if task and task.agent_id:
            agent = db.get(
                Agent,
                task.agent_id
            )

        if agent:
            agent.status = "online"
            agent.current_task = ""

        db.commit()

        error_result = {
            "health": "failed",
            "executor": executor_name or "unknown",
            "warnings": [
                str(exc)
            ],
            "recommendations": [
                "Review ORION backend logs and executor configuration"
            ],
        }

        execution = save_task_execution(
            db=db,
            task=task,
            agent=agent,
            execution_status="failed",
            executor=executor_name or "unknown",
            started_at=started_at,
            started_timer=started_timer,
            result=error_result,
            health="failed",
        )

        raise HTTPException(
            status_code=500,
            detail={
                "message": "Task execution failed",
                "execution_id": execution.id,
                "executor": executor_name,
                "error": str(exc),
            },
        )




# ============================================================
# ORION EXECUTION SERIALIZER
# ============================================================

def _orion_safe_json_load(value, default):
    """
    Safely convert PostgreSQL TEXT JSON fields back into Python objects.
    """
    if value is None or value == "":
        return default

    if isinstance(value, (dict, list)):
        return value

    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError, ValueError):
        return default


def _orion_iso_datetime(value):
    """
    Convert Python datetime objects into browser-friendly ISO strings.
    """
    if value is None:
        return None

    try:
        return value.isoformat()
    except AttributeError:
        return str(value)


def execution_to_dict(execution):
    """
    Convert a TaskExecution SQLAlchemy object into JSON-safe data.
    """

    warnings = _orion_safe_json_load(
        execution.warnings,
        []
    )

    recommendations = _orion_safe_json_load(
        execution.recommendations,
        []
    )

    result = _orion_safe_json_load(
        execution.result_json,
        {}
    )

    return {
        "id": execution.id,
        "task_id": execution.task_id,
        "agent_id": execution.agent_id,

        "task_title": execution.task_title or "",
        "agent_name": execution.agent_name or "",

        "status": execution.status or "unknown",
        "executor": execution.executor or "",
        "health": execution.health or "unknown",

        "started_at": _orion_iso_datetime(
            execution.started_at
        ),

        "completed_at": _orion_iso_datetime(
            execution.completed_at
        ),

        "duration_ms": execution.duration_ms,

        "cpu_percent": execution.cpu_percent,
        "memory_percent": execution.memory_percent,
        "disk_percent": execution.disk_percent,

        "hostname": execution.hostname or "",

        "warnings": warnings,
        "recommendations": recommendations,

        "result": result,

        "created_at": _orion_iso_datetime(
            execution.created_at
        ),
    }


@router.get("/executions")
def get_executions(
    limit: int = 100,
    db: Session = Depends(get_db)
):

    safe_limit = max(
        1,
        min(
            limit,
            500
        )
    )


    executions = (

        db.query(
            TaskExecution
        )

        .order_by(
            TaskExecution.id.desc()
        )

        .limit(
            safe_limit
        )

        .all()

    )


    return [
        execution_to_dict(
            execution
        )
        for execution
        in executions
    ]



@router.get(
    "/executions/{execution_id}"
)
def get_execution(
    execution_id: int,
    db: Session = Depends(get_db)
):

    execution = db.get(
        TaskExecution,
        execution_id
    )


    if not execution:

        raise HTTPException(
            status_code=404,
            detail="Execution report not found"
        )


    return execution_to_dict(
        execution
    )



@router.get(
    "/tasks/{task_id}/executions"
)
def get_task_executions(
    task_id: int,
    db: Session = Depends(get_db)
):

    executions = (

        db.query(
            TaskExecution
        )

        .filter(
            TaskExecution.task_id
            ==
            task_id
        )

        .order_by(
            TaskExecution.id.desc()
        )

        .all()

    )


    return [
        execution_to_dict(
            execution
        )
        for execution
        in executions
    ]



# ============================================================
# ORION REAL INFRASTRUCTURE HEALTH
# ============================================================

@router.get("/infrastructure/health")
def infrastructure_health(db: Session = Depends(get_db)):

    services = {}
    overall_healthy = True

    # --------------------------------------------------------
    # FASTAPI
    # If this endpoint responds, FastAPI is alive.
    # --------------------------------------------------------

    services["fastapi"] = {
        "name": "FastAPI Server",
        "status": "online",
        "address": "127.0.0.1:9000"
    }


    # --------------------------------------------------------
    # POSTGRESQL REAL QUERY
    # --------------------------------------------------------

    db_start = time.perf_counter()

    try:

        db.execute(text("SELECT 1"))

        db_latency = round(
            (time.perf_counter() - db_start) * 1000,
            2
        )

        services["postgresql"] = {
            "name": "PostgreSQL",
            "status": "online",
            "database": "orion_db",
            "latency_ms": db_latency
        }

    except Exception as error:

        overall_healthy = False

        services["postgresql"] = {
            "name": "PostgreSQL",
            "status": "offline",
            "database": "orion_db",
            "error": str(error)
        }


    # --------------------------------------------------------
    # EC2 / HOST SYSTEM
    # --------------------------------------------------------

    hostname = socket.gethostname()

    services["ec2"] = {
        "name": "Amazon EC2",
        "status": "online",
        "hostname": hostname
    }


    # --------------------------------------------------------
    # NGINX LOCAL PORT CHECK
    # --------------------------------------------------------

    nginx_start = time.perf_counter()

    nginx_socket = socket.socket(
        socket.AF_INET,
        socket.SOCK_STREAM
    )

    nginx_socket.settimeout(1)


    try:

        result = nginx_socket.connect_ex(
            ("127.0.0.1", 80)
        )

        nginx_latency = round(
            (time.perf_counter() - nginx_start) * 1000,
            2
        )

        if result == 0:

            services["nginx"] = {
                "name": "Nginx Proxy",
                "status": "online",
                "address": "127.0.0.1:80",
                "latency_ms": nginx_latency
            }

        else:

            overall_healthy = False

            services["nginx"] = {
                "name": "Nginx Proxy",
                "status": "offline",
                "address": "127.0.0.1:80"
            }

    except Exception as error:

        overall_healthy = False

        services["nginx"] = {
            "name": "Nginx Proxy",
            "status": "offline",
            "error": str(error)
        }

    finally:

        nginx_socket.close()


    # --------------------------------------------------------
    # OVERALL ORION STATUS
    # --------------------------------------------------------

    return {
        "status": (
            "healthy"
            if overall_healthy
            else "degraded"
        ),
        "services": services
    }


# ============================================================
# DEPLOYMENTS
# ============================================================

@router.get("/deployments")
def get_deployments(db: Session = Depends(get_db)):
    return db.query(Deployment).order_by(Deployment.id.desc()).all()


@router.post("/deployments", dependencies=[Depends(require_roles("admin"))])
def create_deployment(data: DeploymentCreate, db: Session = Depends(get_db)):
    deployment = Deployment(**data.model_dump())
    db.add(deployment)
    db.commit()
    db.refresh(deployment)
    return deployment


@router.put("/deployments/{deployment_id}", dependencies=[Depends(require_roles("admin"))])
def update_deployment(
    deployment_id: int,
    data: DeploymentUpdate,
    db: Session = Depends(get_db),
):
    deployment = db.get(Deployment, deployment_id)

    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(deployment, key, value)

    db.commit()
    db.refresh(deployment)
    return deployment


@router.delete("/deployments/{deployment_id}", dependencies=[Depends(require_roles("admin"))])
def delete_deployment(deployment_id: int, db: Session = Depends(get_db)):
    deployment = db.get(Deployment, deployment_id)

    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")

    db.delete(deployment)
    db.commit()

    return {"message": "Deployment deleted"}



# ============================================================
# ORION REAL DEPLOYMENT AUTOMATION V1
# ============================================================

@router.post("/deployments/{deployment_id}/run", dependencies=[Depends(require_roles("operator", "admin"))])
def run_real_deployment(
    deployment_id: int,
    db: Session = Depends(get_db),
):
    deployment = db.get(
        Deployment,
        deployment_id
    )

    if not deployment:
        raise HTTPException(
            status_code=404,
            detail="Deployment not found"
        )

    started_at = datetime.now(timezone.utc)
    started_timer = time.perf_counter()

    deployment.status = "running"
    db.commit()

    command = [
        "sudo",
        "-n",
        "/usr/local/sbin/orion-deploy-frontend",
    ]

    try:

        process = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

        completed_at = datetime.now(timezone.utc)

        duration_ms = round(
            (time.perf_counter() - started_timer) * 1000,
            2
        )

        stdout = process.stdout or ""
        stderr = process.stderr or ""

        logs = "\n".join(
            part
            for part in [
                stdout.strip(),
                stderr.strip()
            ]
            if part
        )

        deployment_success = (
            process.returncode == 0
            and "[ORION] DEPLOYMENT SUCCESS" in logs
        )

        status = (
            "success"
            if deployment_success
            else "failed"
        )

        deployment.status = status

        result = {
            "status": status,
            "return_code": process.returncode,
            "deployment_id": deployment.id,
            "name": deployment.name,
            "environment": deployment.environment,
            "version": deployment.version,
            "target_path": "/usr/share/nginx/html",
            "service": "nginx",
            "healthcheck_url": "http://127.0.0.1/",
            "duration_ms": duration_ms,
            "verified": deployment_success,
        }

        deployment_run = DeploymentRun(
            deployment_id=deployment.id,
            name=deployment.name or "",
            environment=deployment.environment or "production",
            version=deployment.version or "v1.0.0",
            action="frontend_deploy",
            status=status,
            target_path="/usr/share/nginx/html",
            service_name="nginx",
            healthcheck_url="http://127.0.0.1/",
            started_at=started_at,
            completed_at=completed_at,
            duration_ms=duration_ms,
            logs=logs,
            result_json=json.dumps(result),
        )

        db.add(deployment_run)
        db.commit()
        db.refresh(deployment_run)
        db.refresh(deployment)

        if not deployment_success:
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "Deployment failed",
                    "deployment_run_id": deployment_run.id,
                    "deployment_id": deployment.id,
                    "logs": logs,
                }
            )

        return {
            "message": "Deployment completed",
            "deployment_id": deployment.id,
            "deployment_run_id": deployment_run.id,
            "status": status,
            "result": result,
            "logs": logs,
        }


    except subprocess.TimeoutExpired as exc:

        completed_at = datetime.now(timezone.utc)

        duration_ms = round(
            (time.perf_counter() - started_timer) * 1000,
            2
        )

        deployment.status = "failed"

        timeout_logs = (
            "Deployment timed out after 120 seconds"
        )

        deployment_run = DeploymentRun(
            deployment_id=deployment.id,
            name=deployment.name or "",
            environment=deployment.environment or "production",
            version=deployment.version or "v1.0.0",
            action="frontend_deploy",
            status="failed",
            target_path="/usr/share/nginx/html",
            service_name="nginx",
            healthcheck_url="http://127.0.0.1/",
            started_at=started_at,
            completed_at=completed_at,
            duration_ms=duration_ms,
            logs=timeout_logs,
            result_json=json.dumps({
                "status": "failed",
                "reason": "timeout",
                "duration_ms": duration_ms,
            }),
        )

        db.add(deployment_run)
        db.commit()
        db.refresh(deployment_run)

        raise HTTPException(
            status_code=504,
            detail={
                "message": "Deployment timed out",
                "deployment_run_id": deployment_run.id,
            }
        )


@router.get("/deployments/{deployment_id}/runs")
def get_deployment_runs(
    deployment_id: int,
    db: Session = Depends(get_db),
):
    deployment = db.get(
        Deployment,
        deployment_id
    )

    if not deployment:
        raise HTTPException(
            status_code=404,
            detail="Deployment not found"
        )

    runs = (
        db.query(DeploymentRun)
        .filter(
            DeploymentRun.deployment_id
            == deployment_id
        )
        .order_by(
            DeploymentRun.id.desc()
        )
        .all()
    )

    response = []

    for run in runs:

        try:
            result = json.loads(
                run.result_json or "{}"
            )
        except Exception:
            result = {}

        response.append({
            "id": run.id,
            "deployment_id": run.deployment_id,
            "task_id": run.task_id,
            "name": run.name,
            "environment": run.environment,
            "version": run.version,
            "action": run.action,
            "status": run.status,
            "target_path": run.target_path,
            "service_name": run.service_name,
            "healthcheck_url": run.healthcheck_url,
            "started_at": (
                run.started_at.isoformat()
                if run.started_at
                else None
            ),
            "completed_at": (
                run.completed_at.isoformat()
                if run.completed_at
                else None
            ),
            "duration_ms": run.duration_ms,
            "logs": run.logs,
            "result": result,
            "created_at": (
                run.created_at.isoformat()
                if run.created_at
                else None
            ),
        })

    return response


@router.get("/deployment-runs")
def get_all_deployment_runs(
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = max(
        1,
        min(limit, 500)
    )

    runs = (
        db.query(DeploymentRun)
        .order_by(
            DeploymentRun.id.desc()
        )
        .limit(limit)
        .all()
    )

    return [
        {
            "id": run.id,
            "deployment_id": run.deployment_id,
            "name": run.name,
            "environment": run.environment,
            "version": run.version,
            "action": run.action,
            "status": run.status,
            "duration_ms": run.duration_ms,
            "service_name": run.service_name,
            "healthcheck_url": run.healthcheck_url,
            "created_at": (
                run.created_at.isoformat()
                if run.created_at
                else None
            ),
        }
        for run in runs
    ]


# ============================================================
# SECURITY
# ============================================================

@router.get("/security-findings", dependencies=[Depends(require_roles("admin"))])
def get_security_findings(db: Session = Depends(get_db)):
    return db.query(SecurityFinding).order_by(SecurityFinding.id.desc()).all()


@router.post("/security-findings", dependencies=[Depends(require_roles("admin"))])
def create_security_finding(
    data: SecurityCreate,
    db: Session = Depends(get_db),
):
    finding = SecurityFinding(**data.model_dump())

    db.add(finding)
    db.commit()
    db.refresh(finding)

    return finding


@router.put("/security-findings/{finding_id}")
def update_security_finding(
    finding_id: int,
    data: SecurityUpdate,
    db: Session = Depends(get_db),
):
    finding = db.get(SecurityFinding, finding_id)

    if not finding:
        raise HTTPException(status_code=404, detail="Security finding not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(finding, key, value)

    db.commit()
    db.refresh(finding)

    return finding


@router.delete("/security-findings/{finding_id}", dependencies=[Depends(require_roles("admin"))])
def delete_security_finding(
    finding_id: int,
    db: Session = Depends(get_db),
):
    finding = db.get(SecurityFinding, finding_id)

    if not finding:
        raise HTTPException(status_code=404, detail="Security finding not found")

    db.delete(finding)
    db.commit()

    return {"message": "Security finding deleted"}


# ============================================================
# SETTINGS
# ============================================================

@router.get("/settings", dependencies=[Depends(require_roles("admin"))])
def get_settings(db: Session = Depends(get_db)):
    return db.query(Setting).order_by(Setting.id.asc()).all()


@router.post("/settings", dependencies=[Depends(require_roles("admin"))])
def create_setting(data: SettingCreate, db: Session = Depends(get_db)):
    existing = db.query(Setting).filter(Setting.key == data.key).first()

    if existing:
        raise HTTPException(status_code=400, detail="Setting already exists")

    setting = Setting(**data.model_dump())

    db.add(setting)
    db.commit()
    db.refresh(setting)

    return setting


@router.put("/settings/{setting_id}")
def update_setting(
    setting_id: int,
    data: SettingUpdate,
    db: Session = Depends(get_db),
):
    setting = db.get(Setting, setting_id)

    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")

    setting.value = data.value

    db.commit()
    db.refresh(setting)

    return setting


@router.delete("/settings/{setting_id}", dependencies=[Depends(require_roles("admin"))])
def delete_setting(setting_id: int, db: Session = Depends(get_db)):
    setting = db.get(Setting, setting_id)

    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")

    db.delete(setting)
    db.commit()

    return {"message": "Setting deleted"}
