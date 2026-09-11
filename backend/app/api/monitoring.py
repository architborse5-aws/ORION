import platform
import socket
import time

import psutil
from fastapi import APIRouter

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])


def bytes_to_gb(value):
    return round(value / (1024 ** 3), 2)


@router.get("/system")
def system_monitor():
    cpu_percent = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    network = psutil.net_io_counters()
    boot_time = psutil.boot_time()

    uptime_seconds = int(time.time() - boot_time)

    days = uptime_seconds // 86400
    hours = (uptime_seconds % 86400) // 3600
    minutes = (uptime_seconds % 3600) // 60

    load1, load5, load15 = psutil.getloadavg()

    return {
        "status": "online",

        "system": {
            "hostname": socket.gethostname(),
            "platform": platform.system(),
            "platform_release": platform.release(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
        },

        "cpu": {
            "cores": psutil.cpu_count(logical=True),
            "physical_cores": psutil.cpu_count(logical=False),
            "usage_percent": cpu_percent,
        },

        "memory": {
            "total_gb": bytes_to_gb(memory.total),
            "used_gb": bytes_to_gb(memory.used),
            "available_gb": bytes_to_gb(memory.available),
            "usage_percent": memory.percent,
        },

        "disk": {
            "total_gb": bytes_to_gb(disk.total),
            "used_gb": bytes_to_gb(disk.used),
            "free_gb": bytes_to_gb(disk.free),
            "usage_percent": disk.percent,
        },

        "network": {
            "bytes_sent": network.bytes_sent,
            "bytes_received": network.bytes_recv,
            "packets_sent": network.packets_sent,
            "packets_received": network.packets_recv,
        },

        "load_average": {
            "1_min": round(load1, 2),
            "5_min": round(load5, 2),
            "15_min": round(load15, 2),
        },

        "uptime": {
            "seconds": uptime_seconds,
            "formatted": f"{days}d {hours}h {minutes}m",
        },
    }


@router.get("/processes")
def process_monitor():
    processes = []

    for process in psutil.process_iter(
        ["pid", "name", "cpu_percent", "memory_percent"]
    ):
        try:
            info = process.info

            processes.append({
                "pid": info["pid"],
                "name": info["name"],
                "cpu_percent": info["cpu_percent"],
                "memory_percent": round(
                    info["memory_percent"] or 0,
                    2
                ),
            })

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    processes.sort(
        key=lambda x: x["memory_percent"],
        reverse=True
    )

    return {
        "total": len(processes),
        "processes": processes[:20],
    }


@router.get("/health")
def health():
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    warnings = []

    if memory.percent >= 85:
        warnings.append("High memory usage")

    if disk.percent >= 85:
        warnings.append("High disk usage")

    status = "healthy" if not warnings else "warning"

    return {
        "status": status,
        "warnings": warnings,
        "memory_percent": memory.percent,
        "disk_percent": disk.percent,
    }
