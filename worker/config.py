import os

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://oneclick:change_me_in_production@localhost:5432/oneclickhost"
)

# Worker settings
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))
BUILD_TIMEOUT = int(os.getenv("BUILD_TIMEOUT", "900"))  # 15 minutes
MAX_CONCURRENT_BUILDS = max(1, int(os.getenv("MAX_CONCURRENT_BUILDS", "1")))
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "/tmp/oneclick-workspace")
WORKER_MODE = os.getenv("WORKER_MODE", "singlehost-dev").lower()
CONTROL_PLANE_API_URL = os.getenv("CONTROL_PLANE_API_URL", "http://api:5000/api")
EXECUTION_NODE_ID = os.getenv("EXECUTION_NODE_ID", "")
EXECUTION_NODE_TOKEN = os.getenv("EXECUTION_NODE_TOKEN", "")
EXECUTION_NODE_NAME = os.getenv("EXECUTION_NODE_NAME", "local-executor")
EXECUTION_NODE_PRIVATE_HOST = os.getenv("EXECUTION_NODE_PRIVATE_HOST", "")
EXECUTION_NODE_REGISTRATION_TOKEN = os.getenv("EXECUTION_NODE_REGISTRATION_TOKEN", "")
EXECUTION_NODE_ARCHITECTURE = os.getenv("EXECUTION_NODE_ARCHITECTURE", os.uname().machine if hasattr(os, "uname") else "unknown")
EXECUTION_NODE_LABELS = [item.strip() for item in os.getenv("EXECUTION_NODE_LABELS", "").split(",") if item.strip()]

# Docker / Traefik
DOCKER_HOST = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")
TRAEFIK_DOMAIN = os.getenv("TRAEFIK_DOMAIN", "localhost")
TRAEFIK_NETWORK = os.getenv("TRAEFIK_NETWORK", "oneclick-apps-net")
EXECUTION_NODE_BIND_HOST = os.getenv("EXECUTION_NODE_BIND_HOST", "0.0.0.0")

# Resource limits per container
CONTAINER_MEMORY_LIMIT = os.getenv("CONTAINER_MEMORY_LIMIT", "256m")
CONTAINER_CPU_LIMIT = float(os.getenv("CONTAINER_CPU_LIMIT", "0.5"))
ENABLE_POST_START_COMMANDS = os.getenv("ONECLICK_ENABLE_POST_START_COMMANDS", "").lower() in {"1", "true", "yes"}
CONTAINER_PIDS_LIMIT = int(os.getenv("CONTAINER_PIDS_LIMIT", "256"))
LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", "200000"))
