import os
import logging
import docker
from docker.errors import NotFound, BuildError, APIError

from config import (
    TRAEFIK_DOMAIN,
    TRAEFIK_NETWORK,
    CONTAINER_MEMORY_LIMIT,
    CONTAINER_CPU_LIMIT,
)

logger = logging.getLogger(__name__)

_client = None

DYNAMIC_DIR = "/etc/traefik/dynamic"


def get_client():
    """Lazily initialize the Docker client."""
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def build_image(source_path: str, image_tag: str) -> tuple[bool, str]:
    """
    Build a Docker image from the source path.

    Returns:
        (success: bool, logs: str)
    """
    log_lines = []

    try:
        logger.info(f"Building Docker image: {image_tag} from {source_path}")

        # Build the image and stream logs
        image, build_logs = get_client().images.build(
            path=source_path,
            tag=image_tag,
            rm=True,
            forcerm=True,
        )

        for chunk in build_logs:
            if "stream" in chunk:
                line = chunk["stream"].strip()
                if line:
                    log_lines.append(line)
                    logger.debug(line)
            elif "error" in chunk:
                log_lines.append(f"ERROR: {chunk['error']}")

        logs_text = "\n".join(log_lines)
        logger.info(f"Successfully built image: {image_tag}")
        return True, logs_text

    except BuildError as e:
        for chunk in e.build_log:
            if "stream" in chunk:
                log_lines.append(chunk["stream"].strip())
            elif "error" in chunk:
                log_lines.append(f"ERROR: {chunk['error']}")

        logs_text = "\n".join(log_lines)
        logger.error(f"Build failed for {image_tag}: {e}")
        return False, logs_text

    except APIError as e:
        logger.error(f"Docker API error: {e}")
        return False, f"Docker API error: {str(e)}"


def _get_traefik_config_path(router_name: str) -> str:
    """Return the path to the Traefik dynamic config file for a given router."""
    return os.path.join(DYNAMIC_DIR, f"{router_name}.yml")


def _remove_traefik_config(router_name: str):
    """
    BUG #7 FIX: Remove the Traefik dynamic routing YAML file when a container is stopped.
    Without this, old routes persist in Traefik even after the container is gone,
    causing 502 Bad Gateway errors on URLs that appear to still be "live".
    """
    config_path = _get_traefik_config_path(router_name)
    try:
        if os.path.exists(config_path):
            os.remove(config_path)
            logger.info(f"Removed Traefik routing config: {config_path}")
        else:
            logger.debug(f"No Traefik config to remove at: {config_path}")
    except OSError as e:
        logger.warning(f"Could not remove Traefik config {config_path}: {e}")


def stop_previous_container(container_name: str):
    """
    Stop and remove a previously running container if it exists.
    Also removes its Traefik routing config file to prevent stale routes.
    """
    router_name = container_name.replace("-", "")

    try:
        container = get_client().containers.get(container_name)
        logger.info(f"Stopping previous container: {container_name}")
        container.stop(timeout=10)
        container.remove(force=True)
        logger.info(f"Removed container: {container_name}")
    except NotFound:
        pass  # No previous container — that's fine
    except APIError as e:
        logger.warning(f"Error stopping container {container_name}: {e}")

    # BUG #7 FIX: Always attempt to remove stale Traefik config, regardless of
    # whether a container existed. Covers the case where the container was
    # manually removed outside of this system.
    _remove_traefik_config(router_name)


def run_container(
    image_tag: str,
    container_name: str,
    project_name: str,
    service_name: str,
    env_vars: dict[str, str] | None = None,
    network_aliases: list[str] | None = None,
) -> tuple[str, str]:
    """
    Run a new container with Traefik labels and optional Docker network aliases.

    network_aliases: Additional hostnames this container can be reached by inside
    the Traefik Docker network. Example: ["smartinvoice-backend"] allows an FE
    nginx.conf to proxy_pass to "smartinvoice-backend" even though the actual
    container name assigned by OneClickHost is "oc-smartinvoice-shield-be".

    Returns:
        (container_id, live_url)
    """
    # Stop any existing container with the same name (and clean up its Traefik config)
    stop_previous_container(container_name)

    # Build the subdomain: {service}-{project}.{domain}
    subdomain = f"{service_name}-{project_name}".lower().replace(" ", "-")
    live_url = f"http://{subdomain}.{TRAEFIK_DOMAIN}"
    router_name = container_name.replace("-", "")

    # NOTE: Docker labels only work when Docker provider is enabled in traefik.yml.
    # On Windows Docker Desktop (Docker provider disabled), these are ignored.
    # The File Provider fallback block below handles routing for Windows dev.
    labels = {
        "traefik.enable": "true",
        f"traefik.http.routers.{router_name}.rule": f"Host(`{subdomain}.{TRAEFIK_DOMAIN}`)",
        f"traefik.http.routers.{router_name}.entrypoints": "web",
    }

    environment = env_vars or {}

    logger.info(f"Running container: {container_name} → {live_url}")
    if network_aliases:
        logger.info(f"Network aliases: {network_aliases}")

    client = get_client()

    # Use create() + connect_container_to_network() + start() instead of run().
    # containers.run() doesn't expose the aliases parameter in networking_config.
    # Aliases let sibling services reach this container by custom hostnames
    # without knowing OneClickHost's internal naming convention (oc-project-service).
    container = client.containers.create(
        image=image_tag,
        name=container_name,
        detach=True,
        labels=labels,
        environment=environment,
        mem_limit=CONTAINER_MEMORY_LIMIT,
        nano_cpus=int(CONTAINER_CPU_LIMIT * 1e9),
        restart_policy={"Name": "unless-stopped"},
        # No network= here; connect manually below to support aliases
    )

    # Connect to Traefik network with the container's own name + any user-defined aliases.
    # The container_name is always included as an alias for consistency.
    all_aliases = [container_name] + (network_aliases or [])
    client.api.connect_container_to_network(
        container.id,
        TRAEFIK_NETWORK,
        aliases=all_aliases,
    )
    logger.info(f"Connected to '{TRAEFIK_NETWORK}' with aliases: {all_aliases}")

    container.start()
    logger.info(f"Container started: {container.short_id}")

    # Reload to get actual running state and exposed ports
    container.reload()

    # ISSUE #9 FIX: Verify container is actually "running" after start.
    # A container can exit immediately due to misconfiguration (wrong env vars,
    # missing entry point, port conflicts, DNS resolution failure in nginx).
    if container.status != "running":
        raise RuntimeError(
            f"Container '{container_name}' failed to start. "
            f"Status: '{container.status}'. "
            f"Check image logs: docker logs {container.short_id}"
        )

    # Try to find the exposed port
    port = 80
    exposed_ports = container.attrs.get("Config", {}).get("ExposedPorts", {})
    if exposed_ports:
        port_str = list(exposed_ports.keys())[0]
        port = int(port_str.split("/")[0])

    # Generate Traefik File Provider config.
    # Primary routing on Windows Docker Desktop (Docker socket provider off).
    # On Linux production, Docker labels handle routing; this is a fallback.
    try:
        import yaml

        if os.path.exists(DYNAMIC_DIR):
            config = {
                "http": {
                    "routers": {
                        router_name: {
                            "rule": f"Host(`{subdomain}.{TRAEFIK_DOMAIN}`)",
                            "service": router_name,
                            "entryPoints": ["web"]
                        }
                    },
                    "services": {
                        router_name: {
                            "loadBalancer": {
                                "servers": [
                                    {"url": f"http://{container_name}:{port}"}
                                ]
                            }
                        }
                    }
                }
            }
            config_path = _get_traefik_config_path(router_name)
            with open(config_path, "w") as f:
                yaml.dump(config, f)
            logger.info(f"Wrote Traefik routing config to {config_path} for port {port}")
    except Exception as e:
        logger.error(f"Failed to generate Traefik config: {e}")

    return container.short_id, live_url


def cleanup_container(container_name: str):
    """
    BUG #8 SUPPORT: Full cleanup of a container and its Traefik config.
    Called by the Worker when it detects a service with Status='deleting'.
    This is a public-facing wrapper around stop_previous_container().
    """
    logger.info(f"Cleaning up container for deleted service: {container_name}")
    stop_previous_container(container_name)

