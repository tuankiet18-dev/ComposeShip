import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

import docker
import yaml
from docker.errors import APIError, NotFound

from config import (
    CONTAINER_CPU_LIMIT,
    CONTAINER_MEMORY_LIMIT,
    ENABLE_POST_START_COMMANDS,
    TRAEFIK_DOMAIN,
    TRAEFIK_NETWORK,
)

logger = logging.getLogger(__name__)

DYNAMIC_DIR = "/etc/traefik/dynamic"
ONECLICK_LABEL = "com.oneclickhost.managed"
ONECLICK_PROJECT_ID_LABEL = "com.oneclickhost.project-id"
ONECLICK_DEPLOYMENT_ID_LABEL = "com.oneclickhost.deployment-id"
SECRET_MASK = "********"

COMPOSE_CANDIDATES = ("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml")
BLOCKED_SERVICE_KEYS = {
    "privileged",
    "devices",
    "device_cgroup_rules",
    "cap_add",
    "security_opt",
}
BLOCKED_HOST_MODE_KEYS = ("network_mode", "pid", "ipc", "uts", "userns_mode")
SENSITIVE_BINDS = ("/", "/etc", "/proc", "/sys", "/var/lib/docker", "/var/run/docker.sock")
APP_CODE_TARGETS = ("/app", "/code", "/src", "/workspace", "/usr/src/app")
INFRA_SERVICE_HINTS = (
    "postgres",
    "timescale",
    "redis",
    "mysql",
    "mariadb",
    "mongo",
    "rabbitmq",
    "kafka",
    "zookeeper",
    "mailhog",
    "mailpit",
    "smtp",
    "database",
)


def _client():
    return docker.from_env()


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-") or "project"


def _run(command: list[str], cwd: str | None = None, timeout: int = 900) -> str:
    logger.info("Running command: %s", " ".join(command))
    completed = subprocess.run(
        command,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    output = completed.stdout or ""
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed ({completed.returncode}): {' '.join(command)}\n{output}")
    return output


def ensure_compose_available() -> str:
    return _run(["docker", "compose", "version"], timeout=30).strip()


def find_compose_file(source_path: str, configured: str | None = None) -> str:
    base = Path(source_path)
    if configured:
        candidate = Path(_resolve_under_source(source_path, configured, "compose file"))
        if candidate.exists() and candidate.is_file():
            return str(candidate)
        raise RuntimeError(f"Configured compose file not found: {configured}")

    for name in COMPOSE_CANDIDATES:
        candidate = base / name
        if candidate.exists():
            return str(candidate)
    raise RuntimeError("No docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml found.")


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _validate_bind(source: str, service_name: str):
    normalized = source.replace("\\", "/")
    for blocked in SENSITIVE_BINDS:
        if normalized == blocked or normalized.startswith(f"{blocked}/"):
            raise RuntimeError(f"Blocked unsafe bind mount in service '{service_name}': {source}")


def _is_relative_host_path(source: str) -> bool:
    normalized = source.replace("\\", "/")
    return normalized == "." or normalized == ".." or normalized.startswith("./") or normalized.startswith("../")


def _resolve_under_source(source_path: str, relative_path: str, description: str) -> str:
    normalized = relative_path.strip().replace("\\", "/")
    if not normalized:
        raise RuntimeError(f"Invalid empty {description}.")
    candidate = Path(normalized)
    if candidate.is_absolute() or re.match(r"^[A-Za-z]:/", normalized):
        raise RuntimeError(f"Blocked absolute host path for {description}: {relative_path}")

    root = Path(source_path).resolve()
    resolved = (root / normalized).resolve()
    if root != resolved and root not in resolved.parents:
        raise RuntimeError(f"Blocked {description} outside repository: {relative_path}")
    return str(resolved)


def _is_app_code_target(target: str) -> bool:
    normalized = target.replace("\\", "/").rstrip("/")
    return normalized in APP_CODE_TARGETS


def _sanitize_env_file(service_name: str, service: dict[str, Any], source_path: str, logs: list[str]):
    env_file = service.get("env_file")
    if not env_file:
        return

    kept: list[Any] = []
    for item in _as_list(env_file):
        if isinstance(item, str):
            path = item
            required = True
        elif isinstance(item, dict):
            path = str(item.get("path") or "")
            required = bool(item.get("required", True))
        else:
            continue

        if not path:
            continue
        resolved = Path(_resolve_under_source(source_path, path, f"env_file '{path}' in service '{service_name}'"))
        if resolved.exists():
            kept.append(item)
        elif required:
            logs.append(f"Removed missing env_file '{path}' from service '{service_name}'. Configure those values in Environment Variables.")

    if kept:
        service["env_file"] = kept[0] if isinstance(env_file, str) and len(kept) == 1 else kept
    else:
        service.pop("env_file", None)


def _sanitize_volumes(service_name: str, service: dict[str, Any], source_path: str, logs: list[str]):
    volumes = service.get("volumes")
    if not volumes:
        return

    sanitized: list[Any] = []
    for volume in _as_list(volumes):
        remove = False
        if isinstance(volume, str):
            if re.match(r"^[A-Za-z]:[\\/]", volume):
                raise RuntimeError(f"Blocked absolute host bind mount in service '{service_name}': {volume}")
            parts = volume.split(":")
            source = parts[0] if parts else ""
            target = parts[1] if len(parts) > 1 else ""
            if source.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", source):
                raise RuntimeError(f"Blocked absolute host bind mount in service '{service_name}': {source}")
            if _is_relative_host_path(source):
                _resolve_under_source(source_path, source, f"volume bind in service '{service_name}'")
                remove = _is_app_code_target(target)
        elif isinstance(volume, dict) and volume.get("type") in (None, "bind"):
            source = str(volume.get("source") or volume.get("src") or "")
            target = str(volume.get("target") or volume.get("dst") or volume.get("destination") or "")
            if source.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", source):
                raise RuntimeError(f"Blocked absolute host bind mount in service '{service_name}': {source}")
            if _is_relative_host_path(source):
                _resolve_under_source(source_path, source, f"volume bind in service '{service_name}'")
                remove = _is_app_code_target(target)

        if remove:
            logs.append(f"Removed source-code bind mount from service '{service_name}' so the built image is used after deploy.")
            continue
        sanitized.append(volume)

    if sanitized:
        service["volumes"] = sanitized
    else:
        service.pop("volumes", None)


def _sanitize_celery_worker_command(service_name: str, service: dict[str, Any], logs: list[str]):
    command = service.get("command")
    if not command:
        return

    is_worker_service = "worker" in service_name.lower()
    if isinstance(command, str):
        normalized = command.lower()
        if is_worker_service and "celery" in normalized and " worker" in normalized and "--concurrency" not in normalized:
            service["command"] = f"{command} --concurrency=2"
            logs.append(f"Limited Celery worker concurrency for service '{service_name}' to avoid memory pressure.")
    elif isinstance(command, list):
        lowered = [str(part).lower() for part in command]
        if is_worker_service and "celery" in lowered and "worker" in lowered and not any(part.startswith("--concurrency") for part in lowered):
            service["command"] = [*command, "--concurrency=2"]
            logs.append(f"Limited Celery worker concurrency for service '{service_name}' to avoid memory pressure.")


def _validate_service(service_name: str, service: dict[str, Any], source_path: str):
    for key in BLOCKED_SERVICE_KEYS:
        if key in service:
            raise RuntimeError(f"Blocked unsafe compose key '{key}' in service '{service_name}'.")

    for key in BLOCKED_HOST_MODE_KEYS:
        if service.get(key) == "host":
            raise RuntimeError(f"Blocked host mode '{key}: host' in service '{service_name}'.")

    for volume in _as_list(service.get("volumes")):
        if isinstance(volume, str):
            if re.match(r"^[A-Za-z]:[\\/]", volume):
                raise RuntimeError(f"Blocked absolute host bind mount in service '{service_name}': {volume}")
            parts = volume.split(":")
            if parts and (parts[0].startswith("/") or re.match(r"^[A-Za-z]:[\\/]", parts[0])):
                raise RuntimeError(f"Blocked absolute host bind mount in service '{service_name}': {parts[0]}")
            if parts and _is_relative_host_path(parts[0]):
                _resolve_under_source(source_path, parts[0], f"volume bind in service '{service_name}'")
        elif isinstance(volume, dict) and volume.get("type") == "bind":
            source = str(volume.get("source") or volume.get("src") or "")
            if source.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", source):
                raise RuntimeError(f"Blocked absolute host bind mount in service '{service_name}': {source}")
            _resolve_under_source(source_path, source, f"volume bind in service '{service_name}'")


def _validate_external_resources(compose: dict[str, Any]):
    for kind in ("networks", "volumes"):
        resources = compose.get(kind) or {}
        if not isinstance(resources, dict):
            continue
        for name, config in resources.items():
            if isinstance(config, dict) and config.get("external"):
                external_name = config.get("name") or name
                if kind != "networks" or external_name != TRAEFIK_NETWORK:
                    raise RuntimeError(f"Blocked external {kind[:-1]} '{external_name}'.")


def _normalize_environment(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return {str(k): "" if v is None else str(v) for k, v in value.items()}
    env = {}
    for item in _as_list(value):
        key, _, val = str(item).partition("=")
        env[key] = val
    return env


def _declares_environment_key(value: Any, key: str) -> bool:
    if value is None:
        return False
    if isinstance(value, dict):
        return key in {str(k) for k in value.keys()}
    for item in _as_list(value):
        declared_key, _, _ = str(item).partition("=")
        if declared_key == key:
            return True
    return False


def _should_receive_implicit_env(service_name: str, service: dict[str, Any]) -> bool:
    value = " ".join(
        str(item or "").lower()
        for item in (
            service_name,
            service.get("image"),
            service.get("container_name"),
        )
    )
    if service_name.lower() in {"db", "database", "postgres", "redis", "cache", "mail", "mailhog", "smtp"}:
        return False
    return not any(hint in value for hint in INFRA_SERVICE_HINTS)


def _service_networks(service: dict[str, Any]) -> dict[str, Any]:
    networks = service.get("networks")
    if networks is None:
        return {"default": None}
    if isinstance(networks, list):
        return {str(name): None for name in networks}
    if isinstance(networks, dict):
        return networks
    return {"default": None}


def prepare_compose_file(
    compose_file: str,
    source_path: str,
    project_id: str,
    deployment_id: str,
    compose_project_name: str,
    routes: list[dict[str, Any]],
    env_vars: list[dict[str, Any]],
) -> tuple[str, list[str]]:
    sanitize_logs: list[str] = []
    with open(compose_file, "r", encoding="utf-8") as f:
        compose = yaml.safe_load(f) or {}

    services = compose.get("services")
    if not isinstance(services, dict) or not services:
        raise RuntimeError("Compose file must contain at least one service.")

    _validate_external_resources(compose)
    route_services = {route["serviceName"] for route in routes}
    missing_routes = route_services - set(services.keys())
    if missing_routes:
        raise RuntimeError(f"Public route references missing compose service(s): {', '.join(sorted(missing_routes))}")

    env_by_service: dict[str, dict[str, str]] = {}
    auto_env_vars: list[dict[str, Any]] = []
    for env in env_vars:
        service_name = (env.get("serviceName") or "").strip()
        if not service_name:
            auto_env_vars.append(env)
            continue
        if service_name not in services:
            raise RuntimeError(f"Environment variable references missing compose service: {service_name}")
        env_by_service.setdefault(service_name, {})[env["key"]] = env["value"]

    for env in auto_env_vars:
        key = env["key"]
        matched_services = [
            service_name
            for service_name, service in services.items()
            if isinstance(service, dict) and _declares_environment_key(service.get("environment"), key)
        ]
        if not matched_services:
            matched_services = [
                service_name
                for service_name, service in services.items()
                if isinstance(service, dict) and _should_receive_implicit_env(service_name, service)
            ]
            if matched_services:
                sanitize_logs.append(
                    "Auto-targeted undeclared environment variable "
                    f"'{key}' to app services: {', '.join(sorted(matched_services))}."
                )
            else:
                raise RuntimeError(
                    f"Environment variable key '{key}' is not declared by any compose service "
                    "and no app service could be inferred. Set a Service name to inject it explicitly."
                )
        for service_name in matched_services:
            env_by_service.setdefault(service_name, {})[key] = env["value"]

    labels = {
        ONECLICK_LABEL: "true",
        ONECLICK_PROJECT_ID_LABEL: project_id,
        ONECLICK_DEPLOYMENT_ID_LABEL: deployment_id,
    }

    compose.setdefault("networks", {})
    compose["networks"]["oneclick-public"] = {"external": True, "name": TRAEFIK_NETWORK}

    for service_name, service in services.items():
        if not isinstance(service, dict):
            raise RuntimeError(f"Compose service '{service_name}' must be an object.")

        _validate_service(service_name, service, source_path)
        _sanitize_env_file(service_name, service, source_path, sanitize_logs)
        _sanitize_volumes(service_name, service, source_path, sanitize_logs)
        _sanitize_celery_worker_command(service_name, service, sanitize_logs)
        service.pop("container_name", None)
        service.pop("ports", None)
        service.pop("expose", None)

        service["labels"] = {
            **_normalize_environment(service.get("labels")),
            **labels,
            "com.oneclickhost.compose-service": service_name,
        }
        service["environment"] = {
            **_normalize_environment(service.get("environment")),
            **env_by_service.get(service_name, {}),
        }
        service.setdefault("mem_limit", CONTAINER_MEMORY_LIMIT)
        service.setdefault("cpus", str(CONTAINER_CPU_LIMIT))

        if service_name in route_services:
            networks = _service_networks(service)
            alias = f"{compose_project_name}-{_slug(service_name)}"
            networks["oneclick-public"] = {"aliases": [alias]}
            service["networks"] = networks

    output_path = os.path.join(source_path, ".oneclick.compose.yml")
    with open(output_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(compose, f, sort_keys=False)
    return output_path, sanitize_logs


def _router_name(compose_project_name: str, route_slug: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", f"compose-{compose_project_name}-{route_slug}")


def _config_path(compose_project_name: str, route_slug: str) -> str:
    return os.path.join(DYNAMIC_DIR, f"compose-{compose_project_name}-{route_slug}.yml")


def write_traefik_routes(compose_project_name: str, project_name: str, routes: list[dict[str, Any]]) -> list[str]:
    public_urls = []
    if not os.path.exists(DYNAMIC_DIR):
        return public_urls

    for route in routes:
        route_slug = _slug(route["routeSlug"])
        service_name = route["serviceName"]
        port = int(route["internalPort"])
        host = f"{route_slug}-{_slug(project_name)}.{TRAEFIK_DOMAIN}"
        public_urls.append(f"http://{host}")
        router_name = _router_name(compose_project_name, route_slug)
        alias = f"{compose_project_name}-{_slug(service_name)}"

        config = {
            "http": {
                "routers": {
                    router_name: {
                        "rule": f"Host(`{host}`)",
                        "service": router_name,
                        "entryPoints": ["web"],
                        "middlewares": [f"{router_name}-cors"],
                    }
                },
                "services": {
                    router_name: {
                        "loadBalancer": {"servers": [{"url": f"http://{alias}:{port}"}]}
                    }
                },
                "middlewares": {
                    f"{router_name}-cors": {
                        "headers": {
                            "accessControlAllowMethods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                            "accessControlAllowHeaders": ["*"],
                            "accessControlAllowOriginListRegex": [rf"^https?://.*\.{TRAEFIK_DOMAIN}$"],
                            "accessControlAllowCredentials": True,
                            "addVaryHeader": True,
                        }
                    }
                },
            }
        }
        with open(_config_path(compose_project_name, route_slug), "w", encoding="utf-8") as f:
            yaml.safe_dump(config, f, sort_keys=False)
    return public_urls


def remove_traefik_routes(compose_project_name: str):
    if not os.path.exists(DYNAMIC_DIR):
        return
    prefix = f"compose-{compose_project_name}-"
    for name in os.listdir(DYNAMIC_DIR):
        if name.startswith(prefix) and name.endswith(".yml"):
            try:
                os.remove(os.path.join(DYNAMIC_DIR, name))
            except OSError as e:
                logger.warning("Could not remove Traefik route %s: %s", name, e)


def _parse_ps(output: str) -> list[dict[str, Any]]:
    output = output.strip()
    if not output:
        return []
    try:
        data = json.loads(output)
        return data if isinstance(data, list) else [data]
    except json.JSONDecodeError:
        rows = []
        for line in output.splitlines():
            line = line.strip()
            if line:
                rows.append(json.loads(line))
        return rows


def _assert_stack_running(compose_project_name: str):
    output = _run(["docker", "compose", "-p", compose_project_name, "ps", "--format", "json"], timeout=60)
    rows = _parse_ps(output)
    if not rows:
        raise RuntimeError("Compose stack did not create any containers.")

    bad = []
    for row in rows:
        state = str(row.get("State") or row.get("Status") or "").lower()
        health = str(row.get("Health") or "").lower()
        name = row.get("Name") or row.get("Service") or "unknown"
        if state not in {"running", "healthy"}:
            bad.append(f"{name}: state={state or 'unknown'}")
        elif health and health not in {"healthy", "running"}:
            bad.append(f"{name}: health={health}")
    if bad:
        raise RuntimeError("Compose stack has unhealthy containers: " + "; ".join(bad))


def _run_post_start_commands(compose_project_name: str, commands: str | None):
    if commands and not ENABLE_POST_START_COMMANDS:
        raise RuntimeError("Post-start commands are disabled on this worker.")

    for index, raw in enumerate((commands or "").splitlines(), start=1):
        command = raw.strip()
        if not command or command.startswith("#"):
            continue
        optional = command.startswith("optional:")
        if optional:
            command = command.removeprefix("optional:").strip()
        service_name, separator, shell_command = command.partition(":")
        if not separator or not service_name.strip() or not shell_command.strip():
            raise RuntimeError(f"Invalid post-start command #{index}. Use 'service: command'.")
        try:
            _run(["docker", "compose", "-p", compose_project_name, "exec", "-T", service_name.strip(), "sh", "-c", shell_command.strip()])
        except RuntimeError:
            if not optional:
                raise
            logger.warning("Optional post-start command #%s failed for %s", index, compose_project_name)


def deploy_compose_stack(
    source_path: str,
    compose_file: str,
    project_id: str,
    deployment_id: str,
    project_name: str,
    compose_project_name: str,
    routes: list[dict[str, Any]],
    env_vars: list[dict[str, Any]],
    post_start_commands: str | None,
) -> tuple[list[str], str]:
    ensure_compose_available()
    sanitized_file, sanitize_logs = prepare_compose_file(
        compose_file,
        source_path,
        project_id,
        deployment_id,
        compose_project_name,
        routes,
        env_vars,
    )
    logs = []
    logs.append(f"Prepared sanitized compose file: {sanitized_file}")
    logs.extend(sanitize_logs)
    logs.append(_run(["docker", "compose", "-p", compose_project_name, "-f", sanitized_file, "up", "-d", "--build"], cwd=source_path))

    time.sleep(5)
    _assert_stack_running(compose_project_name)
    _run_post_start_commands(compose_project_name, post_start_commands)
    _assert_stack_running(compose_project_name)
    public_urls = write_traefik_routes(compose_project_name, project_name, routes)
    if not public_urls:
        raise RuntimeError("No public Traefik routes were created.")
    return public_urls, "\n".join(logs)


def cleanup_compose_stack(compose_project_name: str, remove_volumes: bool):
    client = _client()
    remove_traefik_routes(compose_project_name)
    containers = client.containers.list(
        all=True,
        filters={"label": f"com.docker.compose.project={compose_project_name}"},
    )
    images = []
    for container in containers:
        try:
            images.append(container.image)
            if container.status == "running":
                container.stop(timeout=10)
            container.remove(force=True, v=remove_volumes)
        except APIError as e:
            logger.warning("Could not remove compose container %s: %s", container.name, e)

    if remove_volumes:
        for volume in client.volumes.list(filters={"label": f"com.docker.compose.project={compose_project_name}"}):
            try:
                volume.remove(force=True)
            except APIError as e:
                logger.warning("Could not remove compose volume %s: %s", volume.name, e)

        for image in images:
            tags = image.tags or []
            if any(tag.startswith(("postgres:", "redis:", "timescale/")) for tag in tags):
                continue
            labels = (image.attrs.get("Config") or {}).get("Labels") or {}
            if labels.get(ONECLICK_LABEL) == "true" or labels.get("com.docker.compose.project") == compose_project_name:
                try:
                    client.images.remove(image=image.id, force=True, noprune=False)
                except (APIError, NotFound) as e:
                    logger.debug("Could not remove compose image %s: %s", image.id, e)

    for network in client.networks.list(filters={"label": f"com.docker.compose.project={compose_project_name}"}):
        try:
            network.remove()
        except APIError as e:
            logger.debug("Could not remove compose network %s: %s", network.name, e)
