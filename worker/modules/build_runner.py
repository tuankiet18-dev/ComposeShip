import os
import logging
import time
import re
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
STARTUP_STABILITY_SECONDS = 30
PUBLIC_BUILD_ENV_PREFIXES = ("NEXT_PUBLIC_", "VITE_", "REACT_APP_")
ONECLICK_LABEL = "com.oneclickhost.managed"
ONECLICK_SERVICE_LABEL = "com.oneclickhost.service-id"
ONECLICK_PROJECT_LABEL = "com.oneclickhost.project-name"
ONECLICK_SERVICE_NAME_LABEL = "com.oneclickhost.service-name"


def get_client():
    """Lazily initialize the Docker client."""
    global _client
    if _client is None:
        _client = docker.from_env()
    return _client


def _oneclick_labels(
    project_name: str | None = None,
    service_name: str | None = None,
    service_id: str | None = None,
) -> dict[str, str]:
    """Labels used to identify Docker resources owned by OneClickHost."""
    labels = {ONECLICK_LABEL: "true"}
    if project_name:
        labels[ONECLICK_PROJECT_LABEL] = project_name
    if service_name:
        labels[ONECLICK_SERVICE_NAME_LABEL] = service_name
    if service_id:
        labels[ONECLICK_SERVICE_LABEL] = service_id
    return labels


def _ensure_named_volume(volume_name: str, labels: dict[str, str]):
    """Create a named volume if it does not already exist."""
    client = get_client()
    try:
        return client.volumes.get(volume_name)
    except NotFound:
        return client.volumes.create(name=volume_name, labels=labels)


def write_public_build_env(source_path: str, env_vars: dict[str, str] | None) -> str | None:
    """
    Write public frontend env vars into .env.production before Docker build.

    Vite and Next.js inline public variables during `npm run build`, so
    runtime-only container env vars arrive too late for static frontends.
    """
    public_vars = {
        key: value
        for key, value in (env_vars or {}).items()
        if key.startswith(PUBLIC_BUILD_ENV_PREFIXES)
    }
    if not public_vars:
        return None

    env_path = os.path.join(source_path, ".env.production")
    with open(env_path, "w", encoding="utf-8") as f:
        for key, value in sorted(public_vars.items()):
            escaped = str(value).replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')
            f.write(f'{key}="{escaped}"\n')

    logger.info("Wrote public build environment to %s", env_path)
    return env_path


def build_image(
    source_path: str,
    image_tag: str,
    project_name: str | None = None,
    service_name: str | None = None,
    service_id: str | None = None,
) -> tuple[bool, str]:
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
            labels=_oneclick_labels(project_name, service_name, service_id),
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


def _tail_container_logs(container, tail: int = 80) -> str:
    """Return recent container logs as text without failing the deployment flow."""
    try:
        raw_logs = container.logs(tail=tail, stdout=True, stderr=True)
        return raw_logs.decode("utf-8", errors="replace").strip()
    except Exception as e:
        return f"<unable to read container logs: {e}>"


def _infer_port_from_image(image_tag: str, default_port: int = 80) -> int:
    """Infer the HTTP port from image metadata when Dockerfile has no EXPOSE."""
    try:
        image = get_client().images.get(image_tag)
        config = image.attrs.get("Config", {})
        exposed_ports = config.get("ExposedPorts") or {}
        if exposed_ports:
            port_str = list(exposed_ports.keys())[0]
            return int(port_str.split("/")[0])

        env = config.get("Env") or []
        for item in env:
            if item.startswith("PORT="):
                return int(item.split("=", 1)[1])

        command_parts = (config.get("Entrypoint") or []) + (config.get("Cmd") or [])
        command_text = " ".join(str(part) for part in command_parts)
        match = re.search(r"(?:--port|-p)\s+(\d+)", command_text)
        if match:
            return int(match.group(1))
    except Exception as e:
        logger.debug("Could not infer port for image %s: %s", image_tag, e)

    return default_port


def _run_container_command(container, container_name: str, command: str, description: str):
    """Run one command inside a started container and fail deployment on errors."""
    exit_code, output = container.exec_run(
        f"sh -c {command!r}",
        stdout=True,
        stderr=True,
    )
    logs = output.decode("utf-8", errors="replace").strip() if output else ""
    if exit_code != 0:
        raise RuntimeError(
            f"{description} failed in '{container_name}' with exit code {exit_code}.\n{logs}"
        )
    if logs:
        logger.info("%s output for %s:\n%s", description, container_name, logs)


def _run_post_start_hooks(container, container_name: str, environment: dict[str, str] | None = None):
    """Run common in-container deploy hooks such as Alembic migrations and user commands."""
    try:
        if (environment or {}).get("ONECLICK_SKIP_AUTO_MIGRATE", "").lower() not in {"1", "true", "yes"}:
            _run_container_command(
                container,
                container_name,
                "if [ -f alembic.ini ]; then alembic upgrade head; fi",
                "Post-start migration hook",
            )

        post_start_commands = (environment or {}).get("ONECLICK_POST_START_COMMANDS", "")
        for index, command in enumerate(post_start_commands.splitlines(), start=1):
            command = command.strip()
            if not command or command.startswith("#"):
                continue
            optional = command.startswith("optional:")
            if optional:
                command = command.removeprefix("optional:").strip()
            try:
                _run_container_command(
                    container,
                    container_name,
                    command,
                    f"Post-start command #{index}",
                )
            except RuntimeError as e:
                if not optional:
                    raise
                logger.warning("Optional post-start command #%s failed for %s: %s", index, container_name, e)
    except RuntimeError:
        try:
            container.remove(force=True)
        except APIError as e:
            logger.warning(f"Could not remove failed container {container_name}: {e}")
        raise
    except Exception as e:
        logger.warning("Could not run post-start hooks for %s: %s", container_name, e)


def _assert_container_stable(container, container_name: str):
    """
    Verify a freshly started container stays up after the initial process boot.

    Docker can report "running" immediately after start even when the main
    process crashes a moment later and the restart policy moves it into a
    restart loop. Waiting briefly catches common runtime failures such as
    missing env vars, invalid nginx upstreams, or bad entrypoints.
    """
    initial_restart_count = container.attrs.get("RestartCount", 0)
    last_state = {}

    for _ in range(STARTUP_STABILITY_SECONDS):
        time.sleep(1)
        container.reload()
        last_state = container.attrs.get("State", {})
        status = last_state.get("Status") or container.status
        restart_count = container.attrs.get("RestartCount", 0)

        if status != "running" or last_state.get("Restarting") or restart_count > initial_restart_count:
            break
    else:
        return

    container.reload()
    last_state = container.attrs.get("State", {})
    status = last_state.get("Status") or container.status
    restart_count = container.attrs.get("RestartCount", 0)
    exit_code = last_state.get("ExitCode")
    error = last_state.get("Error") or ""
    logs = _tail_container_logs(container)

    try:
        container.remove(force=True, v=True)
    except APIError as e:
        logger.warning(f"Could not remove failed container {container_name}: {e}")

    details = [
        f"Container '{container_name}' failed startup stability check.",
        f"Status: {status}",
        f"Restart count: {restart_count}",
    ]
    if exit_code is not None:
        details.append(f"Exit code: {exit_code}")
    if error:
        details.append(f"Docker error: {error}")
    if logs:
        details.append(f"Recent container logs:\n{logs}")

    raise RuntimeError("\n".join(details))


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
    service_id: str | None = None,
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
    client = get_client()
    port = _infer_port_from_image(image_tag)

    # NOTE: Docker labels only work when Docker provider is enabled in traefik.yml.
    # On Windows Docker Desktop (Docker provider disabled), these are ignored.
    # The File Provider fallback block below handles routing for Windows dev.
    labels = {
        **_oneclick_labels(project_name, service_name, service_id),
        "traefik.enable": "true",
        f"traefik.http.routers.{router_name}.rule": f"Host(`{subdomain}.{TRAEFIK_DOMAIN}`)",
        f"traefik.http.routers.{router_name}.entrypoints": "web",
        f"traefik.http.services.{router_name}.loadbalancer.server.port": str(port),
    }

    environment = env_vars or {}

    logger.info(f"Running container: {container_name} → {live_url}")
    if network_aliases:
        logger.info(f"Network aliases: {network_aliases}")

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

    _assert_container_stable(container, container_name)
    _run_post_start_hooks(container, container_name, environment)

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
                            "entryPoints": ["web"],
                            "middlewares": [f"{router_name}-cors"],
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
                    },
                    "middlewares": {
                        f"{router_name}-cors": {
                            "headers": {
                                "accessControlAllowMethods": [
                                    "GET",
                                    "POST",
                                    "PUT",
                                    "PATCH",
                                    "DELETE",
                                    "OPTIONS",
                                ],
                                "accessControlAllowHeaders": ["*"],
                                "accessControlAllowOriginListRegex": [
                                    rf"^https?://.*\.{TRAEFIK_DOMAIN}$"
                                ],
                                "accessControlAllowCredentials": True,
                                "addVaryHeader": True,
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


def run_postgres_container(
    container_name: str,
    project_name: str,
    service_name: str,
    env_vars: dict[str, str] | None = None,
    network_aliases: list[str] | None = None,
    service_id: str | None = None,
) -> tuple[str, str]:
    """
    Provision a project-scoped PostgreSQL service.

    Database services are internal-only: they get Docker network aliases but no
    Traefik public route. Application services connect through the alias on
    port 5432.
    """
    stop_previous_container(container_name)

    environment = {
        "POSTGRES_DB": "appdb",
        "POSTGRES_USER": "app",
        **(env_vars or {}),
    }
    if not environment.get("POSTGRES_PASSWORD"):
        raise RuntimeError("POSTGRES_PASSWORD is required for database services.")

    client = get_client()
    image_tag = environment.pop("POSTGRES_IMAGE", "postgres:16-alpine")
    logger.info(f"Ensuring database image is available: {image_tag}")
    client.images.pull(image_tag)

    all_aliases = [container_name] + (network_aliases or [])
    volume_name = f"{container_name}-data"
    labels = _oneclick_labels(project_name, service_name, service_id)
    _ensure_named_volume(volume_name, labels)

    logger.info(f"Running PostgreSQL container: {container_name}")
    if network_aliases:
        logger.info(f"Database network aliases: {network_aliases}")

    container = client.containers.create(
        image=image_tag,
        name=container_name,
        detach=True,
        environment=environment,
        mem_limit=CONTAINER_MEMORY_LIMIT,
        nano_cpus=int(CONTAINER_CPU_LIMIT * 1e9),
        labels=labels,
        restart_policy={"Name": "unless-stopped"},
        volumes={volume_name: {"bind": "/var/lib/postgresql/data", "mode": "rw"}},
    )

    client.api.connect_container_to_network(
        container.id,
        TRAEFIK_NETWORK,
        aliases=all_aliases,
    )
    logger.info(f"Connected database to '{TRAEFIK_NETWORK}' with aliases: {all_aliases}")

    container.start()
    logger.info(f"Database container started: {container.short_id}")
    _assert_container_stable(container, container_name)

    db_name = environment.get("POSTGRES_DB", "appdb")
    host = (network_aliases or [container_name])[0]
    internal_url = f"postgres://{host}:5432/{db_name}"
    return container.short_id, internal_url


def run_redis_container(
    container_name: str,
    project_name: str,
    service_name: str,
    network_aliases: list[str] | None = None,
    service_id: str | None = None,
) -> tuple[str, str]:
    """Provision an internal-only Redis service."""
    stop_previous_container(container_name)

    client = get_client()
    image_tag = "redis:7-alpine"
    logger.info(f"Ensuring Redis image is available: {image_tag}")
    client.images.pull(image_tag)

    all_aliases = [container_name] + (network_aliases or [])
    volume_name = f"{container_name}-data"
    labels = _oneclick_labels(project_name, service_name, service_id)
    _ensure_named_volume(volume_name, labels)

    logger.info(f"Running Redis container: {container_name}")
    if network_aliases:
        logger.info(f"Redis network aliases: {network_aliases}")

    container = client.containers.create(
        image=image_tag,
        name=container_name,
        detach=True,
        mem_limit=CONTAINER_MEMORY_LIMIT,
        nano_cpus=int(CONTAINER_CPU_LIMIT * 1e9),
        labels=labels,
        restart_policy={"Name": "unless-stopped"},
        volumes={volume_name: {"bind": "/data", "mode": "rw"}},
    )

    client.api.connect_container_to_network(
        container.id,
        TRAEFIK_NETWORK,
        aliases=all_aliases,
    )
    logger.info(f"Connected Redis to '{TRAEFIK_NETWORK}' with aliases: {all_aliases}")

    container.start()
    logger.info(f"Redis container started: {container.short_id}")
    _assert_container_stable(container, container_name)

    host = (network_aliases or [container_name])[0]
    return container.short_id, f"redis://{host}:6379/0"


def cleanup_container(container_name: str):
    """
    BUG #8 SUPPORT: Full cleanup of a container and its Traefik config.
    Called by the Worker when it detects a service with Status='deleting'.
    This is a public-facing wrapper around stop_previous_container().
    """
    logger.info(f"Cleaning up container for deleted service: {container_name}")
    stop_previous_container(container_name)


def _is_safe_oneclick_image(image, image_tag: str) -> bool:
    """Only delete images that clearly belong to OneClickHost."""
    labels = (image.attrs.get("Config") or {}).get("Labels") or {}
    if labels.get(ONECLICK_LABEL) == "true":
        return True
    return image_tag.startswith("oneclick-")


def cleanup_service_artifacts(
    container_name: str,
    image_tags: list[str] | None = None,
    service_id: str | None = None,
):
    """
    Remove Docker resources owned by a deleted service.

    Containers and Traefik routes are always removed. Named data volumes are
    removed only for this service. Images are removed only when they are
    OneClickHost-built images, avoiding shared base images like postgres/redis.
    """
    client = get_client()
    cleanup_container(container_name)

    volume_names = {f"{container_name}-data"}
    if service_id:
        for volume in client.volumes.list(filters={"label": f"{ONECLICK_SERVICE_LABEL}={service_id}"}):
            volume_names.add(volume.name)

    for volume_name in sorted(volume_names):
        try:
            volume = client.volumes.get(volume_name)
            volume.remove(force=True)
            logger.info("Removed Docker volume: %s", volume_name)
        except NotFound:
            logger.debug("No Docker volume to remove: %s", volume_name)
        except APIError as e:
            logger.warning("Could not remove Docker volume %s: %s", volume_name, e)

    for image_tag in sorted(set(image_tags or [])):
        if not image_tag:
            continue
        try:
            image = client.images.get(image_tag)
            if not _is_safe_oneclick_image(image, image_tag):
                logger.info("Skipping shared/non-OneClickHost image cleanup: %s", image_tag)
                continue
            client.images.remove(image=image_tag, force=True, noprune=False)
            logger.info("Removed Docker image: %s", image_tag)
        except NotFound:
            logger.debug("No Docker image to remove: %s", image_tag)
        except APIError as e:
            logger.warning("Could not remove Docker image %s: %s", image_tag, e)

