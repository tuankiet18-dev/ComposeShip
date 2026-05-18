"""
OneClick-Host Worker — Main Entry Point

Polls the database for queued deployments and processes them sequentially.
Pipeline: Clone → Detect Stack → Generate Dockerfile → Build → Deploy

Also polls for services marked "deleting" and cleans up their containers/routes.
"""
import time
import logging
import traceback

from config import POLL_INTERVAL, TRAEFIK_DOMAIN
from db import (
    get_connection,
    fetch_queued_deployment,
    fetch_deleting_services,
    fetch_stopping_services,
    permanently_delete_service,
    delete_empty_deleting_projects,
    update_deployment_status,
    update_service_status,
    supersede_previous_deployments,
    get_env_vars,
    fetch_live_backend_url,
)
from modules.repo_cloner import clone_repo, cleanup_workspace
from modules.stack_detector import detect_stack
from modules.dockerfile_generator import generate_dockerfile
from modules.build_runner import (
    build_image,
    run_container,
    run_postgres_container,
    run_redis_container,
    cleanup_container,
    cleanup_service_artifacts,
    write_public_build_env,
)

# ── Logging Setup ─────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("worker")


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

    try:
        if service_type == "database":
            all_logs.append("=== Provisioning PostgreSQL database service ===")
            update_deployment_status(conn, deployment_id, "deploying",
                                     image_tag="postgres:16-alpine",
                                     build_logs="\n".join(all_logs))
            update_service_status(conn, service_id, "deploying", detected_stack="postgres")

            env_vars = get_env_vars(conn, service_id)
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
                                     build_logs="\n".join(all_logs))
            update_service_status(conn, service_id, "live",
                                  live_url=live_url,
                                  container_id=container_id,
                                  detected_stack="postgres")
            supersede_previous_deployments(conn, service_id, deployment_id)
            logger.info(f"✅ Database deployment {deployment_id} succeeded → {live_url}")
            return

        if service_type == "redis":
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
        all_logs.append(f"=== Cloning {repo_url} (branch: {branch}) ===")
        source_path = clone_repo(repo_url, branch, subfolder, deployment_id)
        all_logs.append("✓ Repository cloned successfully")

        # ── Step 2: Detect Stack ──────────────────
        update_deployment_status(conn, deployment_id, "building",
                                 build_logs="\n".join(all_logs))

        all_logs.append("\n=== Detecting technology stack ===")
        stack = detect_stack(source_path)
        all_logs.append(f"✓ Detected stack: {stack}")

        # Update service with detected stack; also sets status to "deploying" (BUG #1 FIX:
        # Worker is the ONLY place that sets "deploying", not the API)
        update_service_status(conn, service_id, "deploying", detected_stack=stack)

        # ── Step 3: Generate Dockerfile ───────────
        all_logs.append("\n=== Generating Dockerfile ===")
        dockerfile_path = generate_dockerfile(source_path, stack)
        all_logs.append(f"✓ Dockerfile ready at {dockerfile_path}")

        # ── Step 4: Build Image ───────────────────
        all_logs.append(f"\n=== Building Docker image: {image_tag} ===")
        update_deployment_status(conn, deployment_id, "building",
                                 build_logs="\n".join(all_logs))

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
        all_logs.append(f"\n=== Deploying container: {container_name} ===")
        update_deployment_status(conn, deployment_id, "deploying",
                                 image_tag=image_tag,
                                 build_logs="\n".join(all_logs))

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
                                 build_logs="\n".join(all_logs))
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

        update_deployment_status(conn, deployment_id, "failed",
                                 error_message=error_msg,
                                 build_logs="\n".join(all_logs))
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
            cleanup_container(container_name)
            permanently_delete_service(conn, service_id)
            logger.info(f"✅ Service {service_id} cleaned up and removed from DB")
        except Exception as e:
            logger.error(f"❌ Failed to cleanup service {service_id}: {e}")
            logger.debug(traceback.format_exc())

    deleted_projects = delete_empty_deleting_projects(conn)
    if deleted_projects:
        logger.info(f"✅ Removed {deleted_projects} fully-cleaned project(s) from DB")


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
            logger.info(f"✅ Service {service_id} stopped")
        except Exception as e:
            logger.error(f"❌ Failed to stop service {service_id}: {e}")
            logger.debug(traceback.format_exc())


def main():
    """Main polling loop."""
    logger.info("🚀 OneClick-Host Worker started")
    logger.info(f"   Poll interval: {POLL_INTERVAL}s")

    while True:
        try:
            conn = get_connection()

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

            process_stopping_services(conn)

            # BUG #8 FIX: Also poll for services waiting to be deleted
            process_deleting_services(conn)

            conn.close()

        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            logger.debug(traceback.format_exc())

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
