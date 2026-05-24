"""
OneClick-Host Worker — Main Entry Point

Polls the database for queued deployments and processes them sequentially.
Pipeline: Clone → Detect Stack → Generate Dockerfile → Build → Deploy

Also polls for services marked "deleting" and cleans up their containers/routes.
"""
import time
import logging
import traceback
import json

from config import LOG_MAX_BYTES, POLL_INTERVAL, TRAEFIK_DOMAIN, WORKER_MODE
from db import (
    get_connection,
    fetch_queued_deployment,
    fetch_queued_project_deployment,
    fetch_deleting_services,
    fetch_deleting_compose_projects,
    fetch_stopping_services,
    fetch_stopping_projects,
    permanently_delete_service,
    permanently_delete_project,
    delete_empty_deleting_projects,
    update_deployment_status,
    update_project_deployment_status,
    update_project_status,
    update_service_status,
    save_deployment_diagnostic_snapshot,
    supersede_previous_deployments,
    supersede_previous_project_deployments,
    get_env_vars,
    fetch_live_backend_url,
    mark_live_deployments_stopped,
    mark_live_project_deployments_stopped,
)
from modules.repo_cloner import clone_repo, cleanup_workspace
from modules.stack_detector import detect_stack
from modules.dockerfile_generator import generate_dockerfile
from modules.diagnostic_collector import build_diagnostic_snapshot
from modules.build_runner import (
    build_image,
    run_container,
    run_postgres_container,
    run_redis_container,
    cleanup_container,
    cleanup_service_artifacts,
    write_public_build_env,
)
from modules.compose_runner import (
    cleanup_compose_stack,
    deploy_compose_stack,
    find_compose_file,
)
from secret_utils import decrypt_secret
from internal_api import ExecutionNodeClient

# ── Logging Setup ─────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("worker")


def _read_json_list(value):
    if not value:
        return []
    return json.loads(value)


def _decrypt_compose_env_vars(env_vars):
    return [
        {
            **env,
            "value": decrypt_secret(env.get("value")),
        }
        for env in env_vars
    ]


def _redact_text(value: str, secret_values) -> str:
    redacted = value
    for secret in secret_values or []:
        if secret and isinstance(secret, str) and len(secret) >= 4:
            redacted = redacted.replace(secret, "********")
    return redacted


def _compose_secret_values(env_vars: list[dict]) -> list[str]:
    return [env.get("value") for env in env_vars if env.get("isSecret")]


def _service_secret_values(env_vars: dict[str, str]) -> list[str]:
    return [value for value in env_vars.values() if value]


def _truncate_logs(value: str) -> str:
    return value if len(value) <= LOG_MAX_BYTES else value[-LOG_MAX_BYTES:]


def _failure_category(error: Exception) -> str:
    value = str(error).lower()
    if "clone" in value or "repository" in value or "github" in value:
        return "clone"
    if "compose file" in value or "blocked" in value or "invalid" in value or "unsafe" in value:
        return "validation"
    if "build" in value:
        return "build"
    if "health" in value or "unhealthy" in value:
        return "healthcheck"
    if "route" in value or "port" in value:
        return "routing"
    if "container" in value or "stack" in value:
        return "startup"
    return "platform"


def process_project_deployment(conn, deployment: dict):
    """Full Docker Compose deployment pipeline for a project-level deployment."""
    deployment_id = str(deployment["Id"])
    project_id = str(deployment["ProjectId"])
    project_name = deployment["ProjectName"]
    repo_url = deployment["RepoUrl"]
    branch = deployment["Branch"]
    subfolder = deployment["Subfolder"]
    compose_project_name = deployment["ComposeProjectName"] or f"oc-{project_id.replace('-', '')[:8]}"
    routes = _read_json_list(deployment.get("ComposeRoutesJson"))
    env_vars = _decrypt_compose_env_vars(_read_json_list(deployment.get("ComposeEnvJson")))
    secret_values = _compose_secret_values(env_vars)
    post_start_commands = deployment.get("ComposePostStartCommands")
    all_logs = []

    try:
        all_logs.append(f"=== Cloning {repo_url} (branch: {branch}) ===")
        source_path = clone_repo(repo_url, branch, subfolder, deployment_id)
        all_logs.append("✓ Repository cloned successfully")
        update_project_deployment_status(conn, deployment_id, "building", build_logs=_redact_text("\n".join(all_logs), secret_values))

        compose_file = find_compose_file(source_path, deployment.get("ComposeFile"))
        all_logs.append(f"✓ Compose file found: {compose_file}")

        update_project_deployment_status(conn, deployment_id, "deploying", build_logs=_redact_text("\n".join(all_logs), secret_values))
        public_urls, compose_logs, _ = deploy_compose_stack(
            source_path=source_path,
            compose_file=compose_file,
            project_id=project_id,
            deployment_id=deployment_id,
            project_name=project_name,
            compose_project_name=compose_project_name,
            routes=routes,
            env_vars=env_vars,
            post_start_commands=post_start_commands,
        )
        all_logs.append(compose_logs)
        all_logs.append("✓ Public URLs:")
        all_logs.extend(public_urls)
        public_urls_json = json.dumps(public_urls)

        update_project_deployment_status(
            conn,
            deployment_id,
            "live",
            compose_project_name=compose_project_name,
            public_urls_json=public_urls_json,
            build_logs=_redact_text("\n".join(all_logs), secret_values),
        )
        update_project_status(conn, project_id, "live", compose_live_urls_json=public_urls_json)
        supersede_previous_project_deployments(conn, project_id, deployment_id)
        logger.info(f"✅ Compose deployment {deployment_id} succeeded → {', '.join(public_urls)}")

    except Exception as e:
        error_msg = str(e)
        all_logs.append(f"\n❌ ERROR: {error_msg}")
        all_logs.append(traceback.format_exc())
        update_project_deployment_status(
            conn,
            deployment_id,
            "failed",
            error_message=_redact_text(error_msg, secret_values),
            build_logs=_redact_text("\n".join(all_logs), secret_values),
        )
        update_project_status(conn, project_id, "failed")
        logger.error(f"❌ Compose deployment {deployment_id} failed: {error_msg}")

    finally:
        cleanup_workspace(deployment_id)


def process_project_deployment_lease(client: ExecutionNodeClient, deployment: dict):
    """Docker Compose deployment pipeline for an API-leased execution node job."""
    deployment_id = str(deployment["deploymentId"])
    project_id = str(deployment["projectId"])
    project_name = deployment["projectName"]
    repo_url = deployment["repoUrl"]
    branch = deployment["branch"]
    subfolder = deployment.get("subfolder")
    compose_project_name = deployment["composeProjectName"]
    routes = deployment.get("routes") or []
    env_vars = deployment.get("environmentVariables") or []
    secret_values = _compose_secret_values(env_vars)
    all_logs: list[str] = []

    try:
        all_logs.append(f"=== Cloning {repo_url} (branch: {branch}) ===")
        source_path = clone_repo(repo_url, branch, subfolder, deployment_id)
        all_logs.append("Repository cloned successfully")
        client.event(
            deployment_id,
            {
                "kind": "compose",
                "status": "building",
                "buildLogs": _truncate_logs(_redact_text("\n".join(all_logs), secret_values)),
            },
        )

        compose_file = find_compose_file(source_path, deployment.get("composeFile"))
        all_logs.append(f"Compose file found: {compose_file}")
        client.event(
            deployment_id,
            {
                "kind": "compose",
                "status": "deploying",
                "buildLogs": _truncate_logs(_redact_text("\n".join(all_logs), secret_values)),
            },
        )

        public_urls, compose_logs, route_targets = deploy_compose_stack(
            source_path=source_path,
            compose_file=compose_file,
            project_id=project_id,
            deployment_id=deployment_id,
            project_name=project_name,
            compose_project_name=compose_project_name,
            routes=routes,
            env_vars=env_vars,
            post_start_commands=deployment.get("postStartCommands"),
            route_mode="execution-node",
        )
        all_logs.append(compose_logs)

        for route_target in route_targets:
            client.route_target(
                {
                    "projectId": project_id,
                    "projectDeploymentId": deployment_id,
                    "serviceId": None,
                    "host": route_target["host"],
                    "targetUrl": route_target["targetUrl"],
                    "status": "active",
                }
            )

        all_logs.append("Public URLs:")
        all_logs.extend(public_urls)
        client.event(
            deployment_id,
            {
                "kind": "compose",
                "status": "live",
                "publicUrls": public_urls,
                "buildLogs": _truncate_logs(_redact_text("\n".join(all_logs), secret_values)),
            },
        )
        logger.info("Compose deployment %s succeeded: %s", deployment_id, ", ".join(public_urls))
    except Exception as e:
        error_msg = str(e)
        all_logs.append(f"\nERROR: {error_msg}")
        all_logs.append(traceback.format_exc())
        client.event(
            deployment_id,
            {
                "kind": "compose",
                "status": "failed",
                "errorMessage": _redact_text(error_msg, secret_values),
                "failureCategory": _failure_category(e),
                "buildLogs": _truncate_logs(_redact_text("\n".join(all_logs), secret_values)),
            },
        )
        logger.error("Compose deployment %s failed: %s", deployment_id, error_msg)
    finally:
        cleanup_workspace(deployment_id)


def process_deployment(conn, deployment: dict):
    """
    Full deployment pipeline for a single queued deployment.
    """
    deployment_id = str(deployment["Id"])
    service_id = str(deployment["ServiceId"])
    project_id = str(deployment["ProjectId"])
    repo_url = deployment["RepoUrl"]
    branch = deployment["Branch"]
    subfolder = deployment["Subfolder"]
    service_name = deployment["ServiceName"]
    service_type = deployment.get("ServiceType") or "frontend"
    project_name = deployment["ProjectName"]
    version = deployment["Version"]

    image_tag = f"oneclick-{project_name}-{service_name}:v{version}".lower().replace(" ", "-")
    container_name = f"oc-{project_name}-{service_name}".lower().replace(" ", "-")

    all_logs = []
    env_vars = {}
    source_path = None
    stack = None
    failure_step = "unknown"

    try:
        if service_type == "database":
            stack = "postgres"
            failure_step = "container_start"
            all_logs.append("=== Provisioning PostgreSQL database service ===")
            update_deployment_status(conn, deployment_id, "deploying",
                                     image_tag="postgres:16-alpine",
                                     build_logs="\n".join(all_logs))
            update_service_status(conn, service_id, "deploying", detected_stack="postgres")

            env_vars = get_env_vars(conn, service_id)
            secret_values = _service_secret_values(env_vars)
            raw_aliases = deployment.get("NetworkAliases") or ""
            network_aliases = [a.strip() for a in raw_aliases.split(",") if a.strip()] or None

            container_id, live_url = run_postgres_container(
                container_name,
                project_name,
                service_name,
                env_vars=env_vars,
                network_aliases=network_aliases,
                service_id=service_id,
            )

            all_logs.append(f"✓ Database container running: {container_id}")
            all_logs.append(f"✓ Internal URL: {live_url}")

            update_deployment_status(conn, deployment_id, "live",
                                     image_tag="postgres:16-alpine",
                                     build_logs=_redact_text("\n".join(all_logs), secret_values))
            update_service_status(conn, service_id, "live",
                                  live_url=live_url,
                                  container_id=container_id,
                                  detected_stack="postgres")
            supersede_previous_deployments(conn, service_id, deployment_id)
            logger.info(f"✅ Database deployment {deployment_id} succeeded → {live_url}")
            return

        if service_type == "redis":
            stack = "redis"
            failure_step = "container_start"
            all_logs.append("=== Provisioning Redis service ===")
            update_deployment_status(conn, deployment_id, "deploying",
                                     image_tag="redis:7-alpine",
                                     build_logs="\n".join(all_logs))
            update_service_status(conn, service_id, "deploying", detected_stack="redis")

            raw_aliases = deployment.get("NetworkAliases") or ""
            network_aliases = [a.strip() for a in raw_aliases.split(",") if a.strip()] or None

            container_id, live_url = run_redis_container(
                container_name,
                project_name,
                service_name,
                network_aliases=network_aliases,
                service_id=service_id,
            )

            all_logs.append(f"✓ Redis container running: {container_id}")
            all_logs.append(f"✓ Internal URL: {live_url}")

            update_deployment_status(conn, deployment_id, "live",
                                     image_tag="redis:7-alpine",
                                     build_logs="\n".join(all_logs))
            update_service_status(conn, service_id, "live",
                                  live_url=live_url,
                                  container_id=container_id,
                                  detected_stack="redis")
            supersede_previous_deployments(conn, service_id, deployment_id)
            logger.info(f"✅ Redis deployment {deployment_id} succeeded → {live_url}")
            return

        # ── Step 1: Clone ─────────────────────────
        failure_step = "clone_repo"
        all_logs.append(f"=== Cloning {repo_url} (branch: {branch}) ===")
        source_path = clone_repo(repo_url, branch, subfolder, deployment_id)
        all_logs.append("✓ Repository cloned successfully")

        # ── Step 2: Detect Stack ──────────────────
        failure_step = "stack_detection"
        update_deployment_status(conn, deployment_id, "building",
                                 build_logs=_redact_text("\n".join(all_logs), _service_secret_values(env_vars)))

        all_logs.append("\n=== Detecting technology stack ===")
        stack = detect_stack(source_path)
        all_logs.append(f"✓ Detected stack: {stack}")

        # Update service with detected stack; also sets status to "deploying" (BUG #1 FIX:
        # Worker is the ONLY place that sets "deploying", not the API)
        update_service_status(conn, service_id, "deploying", detected_stack=stack)

        # ── Step 3: Generate Dockerfile ───────────
        failure_step = "dockerfile_generation"
        all_logs.append("\n=== Generating Dockerfile ===")
        dockerfile_path = generate_dockerfile(source_path, stack)
        all_logs.append(f"✓ Dockerfile ready at {dockerfile_path}")

        # ── Step 4: Build Image ───────────────────
        failure_step = "docker_build"
        all_logs.append(f"\n=== Building Docker image: {image_tag} ===")
        update_deployment_status(conn, deployment_id, "building",
                                 build_logs=_redact_text("\n".join(all_logs), _service_secret_values(env_vars)))

        env_vars = get_env_vars(conn, service_id)
        if service_type == "frontend" and not any(
            key.startswith(("VITE_", "NEXT_PUBLIC_", "REACT_APP_")) for key in env_vars
        ):
            backend_url = fetch_live_backend_url(conn, project_id)
            if not backend_url:
                backend_url = f"http://be-{project_name}".lower().replace(" ", "-") + f".{TRAEFIK_DOMAIN}"
            env_vars["VITE_API_BASE_URL"] = backend_url
            all_logs.append(f"Using inferred frontend API URL: {backend_url}")

        public_env_path = write_public_build_env(source_path, env_vars)
        if public_env_path:
            all_logs.append(f"Public frontend build environment written: {public_env_path}")

        success, build_logs = build_image(
            source_path,
            image_tag,
            project_name=project_name,
            service_name=service_name,
            service_id=service_id,
        )
        all_logs.append(build_logs)

        if not success:
            raise RuntimeError(f"Docker build failed. See logs above.")

        all_logs.append(f"\n✓ Image built: {image_tag}")

        # ── Step 5: Deploy Container ──────────────
        failure_step = "container_start"
        all_logs.append(f"\n=== Deploying container: {container_name} ===")
        update_deployment_status(conn, deployment_id, "deploying",
                                 image_tag=image_tag,
                                 build_logs=_redact_text("\n".join(all_logs), _service_secret_values(env_vars)))

        # Parse NetworkAliases from comma-separated string (e.g. "smartinvoice-backend,backend")
        # into a list for Docker SDK. Strip whitespace and filter empty strings.
        raw_aliases = deployment.get("NetworkAliases") or ""
        network_aliases = [a.strip() for a in raw_aliases.split(",") if a.strip()] or None

        container_id, live_url = run_container(
            image_tag, container_name,
            project_name, service_name,
            env_vars=env_vars,
            network_aliases=network_aliases,
            service_id=service_id,
        )


        all_logs.append(f"✓ Container running: {container_id}")
        all_logs.append(f"✓ Live URL: {live_url}")

        # ── Success ───────────────────────────────
        update_deployment_status(conn, deployment_id, "live",
                                 image_tag=image_tag,
                                 build_logs=_redact_text("\n".join(all_logs), _service_secret_values(env_vars)))
        update_service_status(conn, service_id, "live",
                              live_url=live_url,
                              container_id=container_id)

        # Mark all previous "live" deployments of this service as "superseded".
        # Only 1 container runs at a time — the UI should clearly reflect that.
        supersede_previous_deployments(conn, service_id, deployment_id)

        logger.info(f"✅ Deployment {deployment_id} succeeded → {live_url}")


    except Exception as e:
        error_msg = str(e)
        all_logs.append(f"\n❌ ERROR: {error_msg}")
        all_logs.append(traceback.format_exc())
        secret_values = _service_secret_values(env_vars)
        redacted_error = _redact_text(error_msg, secret_values)
        full_logs = _redact_text("\n".join(all_logs), secret_values)

        try:
            snapshot = build_diagnostic_snapshot(
                source_path=source_path,
                detected_stack=stack,
                full_logs=full_logs,
                failure_step=failure_step,
                error_message=redacted_error,
            )
            save_deployment_diagnostic_snapshot(conn, deployment_id, snapshot)
        except Exception as snapshot_error:
            try:
                conn.rollback()
            except Exception:
                pass
            logger.warning(
                "Could not save diagnostic snapshot for deployment %s: %s",
                deployment_id,
                snapshot_error,
            )

        update_deployment_status(conn, deployment_id, "failed",
                                 error_message=redacted_error,
                                 build_logs=full_logs)
        # BUG #2 is fixed in update_service_status — it clears LiveUrl/ContainerId on failure
        update_service_status(conn, service_id, "failed")

        logger.error(f"❌ Deployment {deployment_id} failed: {error_msg}")

    finally:
        # Clean up workspace
        cleanup_workspace(deployment_id)


def process_deleting_services(conn):
    """
    BUG #8 FIX: Poll for services marked as 'deleting' and perform full cleanup:
    1. Stop and remove the Docker container
    2. Remove the Traefik routing YAML file
    3. Remove service-owned Docker volumes and app images
    4. Permanently delete the DB record

    This ensures containers and routes are properly cleaned up when a user
    deletes a service from the dashboard — the API only marks Status='deleting',
    the Worker performs the actual cleanup.
    """
    services = fetch_deleting_services(conn)
    for service in services:
        service_id = str(service["Id"])
        project_name = service["ProjectName"]
        service_name = service["ServiceName"]
        container_name = f"oc-{project_name}-{service_name}".lower().replace(" ", "-")

        logger.info(
            f"🗑️  Cleaning up deleted service: {project_name}/{service_name} "
            f"(container: {container_name})"
        )

        try:
            cleanup_service_artifacts(container_name, image_tags=list(service.get("ImageTags") or []), service_id=service_id)
            permanently_delete_service(conn, service_id)
            logger.info(f"✅ Service {service_id} cleaned up and removed from DB")
        except Exception as e:
            logger.error(f"❌ Failed to cleanup service {service_id}: {e}")
            logger.debug(traceback.format_exc())

    deleted_projects = delete_empty_deleting_projects(conn)
    if deleted_projects:
        logger.info(f"✅ Removed {deleted_projects} fully-cleaned project(s) from DB")


def process_stopping_projects(conn):
    """Stop Compose project stacks without removing volumes."""
    projects = fetch_stopping_projects(conn)
    for project in projects:
        project_id = str(project["Id"])
        compose_project_name = project["ComposeProjectName"]
        if not compose_project_name:
            update_project_status(conn, project_id, "stopped", compose_live_urls_json="[]")
            continue

        logger.info(f"Stopping Compose project: {project['ProjectName']} ({compose_project_name})")
        try:
            cleanup_compose_stack(compose_project_name, remove_volumes=False)
            update_project_status(conn, project_id, "stopped", compose_live_urls_json="[]")
            mark_live_project_deployments_stopped(conn, project_id)
            logger.info(f"Compose project {project_id} stopped")
        except Exception as e:
            update_project_status(conn, project_id, "failed")
            logger.error(f"Failed to stop Compose project {project_id}: {e}")
            logger.debug(traceback.format_exc())


def process_deleting_compose_projects(conn):
    """Cleanup Compose project stacks, then delete the project row."""
    projects = fetch_deleting_compose_projects(conn)
    for project in projects:
        project_id = str(project["Id"])
        compose_project_name = project["ComposeProjectName"]
        remove_volumes = bool(project["ComposeDeleteVolumesOnDelete"])

        logger.info(
            f"Deleting Compose project: {project['ProjectName']} "
            f"({compose_project_name}, remove_volumes={remove_volumes})"
        )
        try:
            if compose_project_name:
                cleanup_compose_stack(compose_project_name, remove_volumes=remove_volumes)
            permanently_delete_project(conn, project_id)
            logger.info(f"Compose project {project_id} cleaned up and removed from DB")
        except Exception as e:
            update_project_status(conn, project_id, "deleting_failed")
            logger.error(f"Failed to delete Compose project {project_id}: {e}")
            logger.debug(traceback.format_exc())


def process_stopping_services(conn):
    """
    Stop services without deleting their DB records.

    The API marks Status='stopping'. The Worker performs Docker/Traefik cleanup
    then marks the service as 'stopped' and clears LiveUrl/ContainerId.
    """
    services = fetch_stopping_services(conn)
    for service in services:
        service_id = str(service["Id"])
        project_name = service["ProjectName"]
        service_name = service["ServiceName"]
        container_name = f"oc-{project_name}-{service_name}".lower().replace(" ", "-")
        image_tags = list(service.get("ImageTags") or [])

        logger.info(
            f"⏹️  Stopping service: {project_name}/{service_name} "
            f"(container: {container_name})"
        )

        try:
            cleanup_service_artifacts(container_name, image_tags=image_tags, service_id=service_id)
            update_service_status(conn, service_id, "stopped")
            mark_live_deployments_stopped(conn, service_id)
            logger.info(f"✅ Service {service_id} stopped")
        except Exception as e:
            logger.error(f"❌ Failed to stop service {service_id}: {e}")
            logger.debug(traceback.format_exc())


def run_singlehost_loop():
    """Legacy local/dev polling loop that reads jobs directly from PostgreSQL."""
    logger.info("OneClick-Host Worker started in singlehost-dev mode")
    logger.info(f"   Poll interval: {POLL_INTERVAL}s")

    while True:
        try:
            conn = get_connection()

            project_deployment = fetch_queued_project_deployment(conn)
            if project_deployment:
                logger.info(
                    f"Processing Compose deployment {project_deployment['Id']} "
                    f"for {project_deployment['ProjectName']}"
                )
                process_project_deployment(conn, project_deployment)

            # Poll for new deployments to process
            deployment = fetch_queued_deployment(conn)
            if deployment:
                logger.info(
                    f"📦 Processing deployment {deployment['Id']} "
                    f"for {deployment['ProjectName']}/{deployment['ServiceName']}"
                )
                process_deployment(conn, deployment)
            else:
                logger.debug("No queued deployments. Sleeping...")

            process_stopping_projects(conn)
            process_stopping_services(conn)

            # BUG #8 FIX: Also poll for services waiting to be deleted
            process_deleting_services(conn)
            process_deleting_compose_projects(conn)

            conn.close()

        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            logger.debug(traceback.format_exc())

        time.sleep(POLL_INTERVAL)


def run_executor_loop():
    """Production execution-node loop. Jobs are leased through the control-plane API."""
    logger.info("OneClick-Host Worker started in executor mode")
    client = ExecutionNodeClient()
    client.ensure_registered()

    while True:
        try:
            client.heartbeat(current_builds=0, status="active")
            lease = client.lease()
            if lease.get("hasWork") and lease.get("kind") == "compose":
                process_project_deployment_lease(client, lease["compose"])
            elif lease.get("hasWork"):
                logger.warning("Service deployment leases are reserved for a later executor implementation.")
                service = lease.get("service") or {}
                deployment_id = service.get("deploymentId")
                if deployment_id:
                    client.event(
                        deployment_id,
                        {
                            "kind": "service",
                            "status": "failed",
                            "failureCategory": "platform",
                            "errorMessage": "Service deployment executor is not enabled; use Compose deployment for multi-node production.",
                        },
                    )
            else:
                logger.debug("No leased work. Sleeping...")
        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.error("Executor loop error: %s", e)
            logger.debug(traceback.format_exc())

        time.sleep(POLL_INTERVAL)


def main():
    if WORKER_MODE == "executor":
        run_executor_loop()
    elif WORKER_MODE == "dispatcher":
        logger.info("Dispatcher mode is handled by the control-plane lease endpoint; sleeping as health monitor.")
        while True:
            time.sleep(POLL_INTERVAL)
    else:
        run_singlehost_loop()


if __name__ == "__main__":
    main()
