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

# Docker / Traefik
DOCKER_HOST = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")
TRAEFIK_DOMAIN = os.getenv("TRAEFIK_DOMAIN", "localhost")
TRAEFIK_NETWORK = os.getenv("TRAEFIK_NETWORK", "oneclick-apps-net")

# Resource limits per container
CONTAINER_MEMORY_LIMIT = os.getenv("CONTAINER_MEMORY_LIMIT", "256m")
CONTAINER_CPU_LIMIT = float(os.getenv("CONTAINER_CPU_LIMIT", "0.5"))
CONTAINER_PIDS_LIMIT = int(os.getenv("CONTAINER_PIDS_LIMIT", "256"))
