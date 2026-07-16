import os

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://composeship:change_me_in_production@localhost:5432/composeship"
)

# Worker settings
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "5"))
BUILD_TIMEOUT = int(os.getenv("BUILD_TIMEOUT", "900"))  # 15 minutes
MAX_CONCURRENT_BUILDS = max(1, int(os.getenv("MAX_CONCURRENT_BUILDS", "1")))
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "/tmp/composeship-workspace")
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
TRAEFIK_NETWORK = os.getenv("TRAEFIK_NETWORK", "composeship-apps-net")
EXECUTION_NODE_BIND_HOST = os.getenv("EXECUTION_NODE_BIND_HOST", "0.0.0.0")
CLOUDFLARED_IMAGE = os.getenv(
    "CLOUDFLARED_IMAGE",
    "cloudflare/cloudflared@sha256:188bb03589a32affed3cf4d0590565ffe67b78866e6b5582574afab2b705bafe",
)

# Resource limits per container
CONTAINER_MEMORY_LIMIT = os.getenv("CONTAINER_MEMORY_LIMIT", "256m")
CONTAINER_CPU_LIMIT = float(os.getenv("CONTAINER_CPU_LIMIT", "0.5"))
ENABLE_POST_START_COMMANDS = os.getenv("COMPOSESHIP_ENABLE_POST_START_COMMANDS", "").lower() in {"1", "true", "yes"}
CONTAINER_PIDS_LIMIT = int(os.getenv("CONTAINER_PIDS_LIMIT", "256"))
LOG_MAX_BYTES = int(os.getenv("LOG_MAX_BYTES", "200000"))
CONTAINER_LOG_MAX_SIZE = os.getenv("CONTAINER_LOG_MAX_SIZE", "10m")
CONTAINER_LOG_MAX_FILES = max(1, int(os.getenv("CONTAINER_LOG_MAX_FILES", "3")))

# Disk pressure and periodic cleanup
DISK_MIN_FREE_BYTES = max(0, int(os.getenv("DISK_MIN_FREE_BYTES", str(5 * 1024**3))))
DISK_MIN_FREE_PERCENT = max(0.0, min(100.0, float(os.getenv("DISK_MIN_FREE_PERCENT", "10"))))
DISK_CLEANUP_FREE_PERCENT = max(DISK_MIN_FREE_PERCENT, min(100.0, float(os.getenv("DISK_CLEANUP_FREE_PERCENT", "20"))))
CLEANUP_INTERVAL_SECONDS = max(60, int(os.getenv("CLEANUP_INTERVAL_SECONDS", "900")))
CLEANUP_ARTIFACT_MAX_AGE_SECONDS = max(3600, int(os.getenv("CLEANUP_ARTIFACT_MAX_AGE_SECONDS", "86400")))
CLEANUP_BUILD_CACHE_MAX_AGE_SECONDS = max(3600, int(os.getenv("CLEANUP_BUILD_CACHE_MAX_AGE_SECONDS", "86400")))
