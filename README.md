# ORION — Autonomous Digital Company Operating System

ORION is an AWS EC2 cloud operations platform built with FastAPI, PostgreSQL, Nginx, Linux and JavaScript.

## Highlights

- Real-time EC2, Nginx, PostgreSQL and API monitoring
- Multi-executor task engine
- Persistent execution history
- Controlled deployment automation with backup, validation and rollback
- JWT authentication with Admin / Operator / Viewer RBAC
- Administrator-only provisioning
- Live dashboard and executor-aware reports

## Architecture

```text
Browser
  |
  v
Nginx :80
  |
  +-- Frontend
  |
  +-- /api/*
        |
        v
   FastAPI :9000
   127.0.0.1 only
        |
        +-- JWT / RBAC
        +-- Executor Engine
        +-- Deployment Engine
        |
        v
    PostgreSQL
```

## Stack

AWS EC2, Amazon Linux, Python, FastAPI, Uvicorn, PostgreSQL 15, SQLAlchemy, Nginx, systemd, HTML, CSS, JavaScript, JWT and bcrypt.

## Executors

- System Health
- Nginx Health
- PostgreSQL Health
- ORION API Health
- Process Analysis
- Storage Analysis
- Network Diagnostics
- Security Audit
- Resource Provisioning

The task engine does not expose unrestricted shell execution.

## Deployment Workflow

```text
Deployment Request
  -> FastAPI
  -> Restricted sudo
  -> Approved deployment helper
  -> Backup
  -> Nginx validation
  -> Reload
  -> HTTP verification
  -> Rollback on failure
```

## Roles

- **Admin** — full management, deployment and provisioning
- **Operator** — run approved tasks and deployments
- **Viewer** — read-only dashboard and reports

## Security

- FastAPI bound to `127.0.0.1:9000`
- Nginx used as public reverse proxy
- PostgreSQL not intentionally exposed publicly
- JWT + bcrypt + backend-enforced RBAC
- Restricted sudo deployment helper
- `.env`, virtual environments, keys, dumps, logs and backups excluded from Git

## Current Resources

```text
Projects: ORION Platform, Nova Cloud Platform
AI Employees: Sentinel, OrionOps, Atlas
Deployments: ORION Production, Nova Production
```

## Author

**Archit Borse**  
Cloud / DevOps / AWS Portfolio Project

**ORION v1.0**
