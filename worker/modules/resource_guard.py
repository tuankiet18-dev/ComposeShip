import fcntl
import logging
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import docker
from docker.errors import APIError, NotFound

from config import (
    CLEANUP_ARTIFACT_MAX_AGE_SECONDS,
    CLEANUP_BUILD_CACHE_MAX_AGE_SECONDS,
    CLEANUP_INTERVAL_SECONDS,
    DISK_CLEANUP_FREE_PERCENT,
    DISK_MIN_FREE_BYTES,
    DISK_MIN_FREE_PERCENT,
    WORKSPACE_DIR,
)

logger = logging.getLogger(__name__)

MANAGED_LABEL = "com.composeship.managed"
DEPLOYMENT_LABEL = "com.composeship.deployment-id"
COMPOSE_PROJECT_LABEL = "com.docker.compose.project"
SERVICE_LABEL = "com.composeship.service-id"


class DiskPressureError(RuntimeError):
    pass


def disk_snapshot(path: str = WORKSPACE_DIR) -> dict[str, float | int]:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(target)
    free_percent = (usage.free / usage.total * 100) if usage.total else 0.0
    return {"total": usage.total, "free": usage.free, "free_percent": free_percent}


def below_cleanup_watermark(snapshot: dict[str, float | int]) -> bool:
    return float(snapshot["free_percent"]) < DISK_CLEANUP_FREE_PERCENT


def ensure_build_capacity(cleanup_callback=None, path: str = WORKSPACE_DIR):
    snapshot = disk_snapshot(path)
    if below_cleanup_watermark(snapshot) and cleanup_callback is not None:
        cleanup_callback()
        snapshot = disk_snapshot(path)

    if int(snapshot["free"]) < DISK_MIN_FREE_BYTES or float(snapshot["free_percent"]) < DISK_MIN_FREE_PERCENT:
        free_gib = int(snapshot["free"]) / 1024**3
        raise DiskPressureError(
            f"Execution node disk is below the safe build watermark "
            f"({free_gib:.1f} GiB, {float(snapshot['free_percent']):.1f}% free). "
            "Cleanup is required before another deployment can start."
        )


def _created_epoch(value) -> float:
    if not value:
        return time.time()
    if isinstance(value, (int, float)):
        return float(value)
    normalized = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).astimezone(timezone.utc).timestamp()
    except ValueError:
        return time.time()


class PeriodicCleaner:
    def __init__(self, client=None, workspace_dir: str = WORKSPACE_DIR, clock=time.time):
        self.client = client or docker.from_env()
        self.workspace_dir = Path(workspace_dir)
        self.clock = clock
        self.last_run = 0.0
        self.lock_path = self.workspace_dir / ".cleanup.lock"

    def is_due(self) -> bool:
        return self.clock() - self.last_run >= CLEANUP_INTERVAL_SECONDS

    def run(self, inventory: dict | None = None, force: bool = False) -> dict[str, int]:
        if not force and not self.is_due():
            return {"workspaces": 0, "containers": 0, "images": 0, "cache_bytes": 0}

        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a+") as lock_file:
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                logger.info("Skipping cleanup because another cleaner holds the host lock")
                return {"workspaces": 0, "containers": 0, "images": 0, "cache_bytes": 0}

            inventory = inventory or {}
            active_deployments = {str(value) for value in inventory.get("activeDeploymentIds", [])}
            active_services = {str(value) for value in inventory.get("activeServiceIds", [])}
            active_projects = {str(value) for value in inventory.get("activeComposeProjectNames", [])}
            active_image_tags = {str(value) for value in inventory.get("activeImageTags", [])}
            cutoff = self.clock() - CLEANUP_ARTIFACT_MAX_AGE_SECONDS

            report = {
                "workspaces": self._clean_workspaces(active_deployments, cutoff),
                "containers": self._clean_containers(active_deployments, active_services, active_projects, cutoff),
                "images": self._clean_images(active_projects, active_image_tags, cutoff),
                "cache_bytes": 0,
            }

            if below_cleanup_watermark(disk_snapshot(str(self.workspace_dir))):
                report["cache_bytes"] = self._prune_build_cache()

            self.last_run = self.clock()
            logger.info("Periodic resource cleanup completed: %s", report)
            return report

    def _clean_workspaces(self, active_deployments: set[str], cutoff: float) -> int:
        removed = 0
        for entry in self.workspace_dir.iterdir():
            if not entry.is_dir() or entry.name in active_deployments:
                continue
            try:
                if entry.stat().st_mtime < cutoff:
                    shutil.rmtree(entry)
                    removed += 1
            except FileNotFoundError:
                continue
        return removed

    def _clean_containers(
        self,
        active_deployments: set[str],
        active_services: set[str],
        active_projects: set[str],
        cutoff: float,
    ) -> int:
        removed = 0
        for container in self.client.containers.list(all=True, filters={"label": f"{MANAGED_LABEL}=true"}):
            labels = container.labels or {}
            if labels.get(DEPLOYMENT_LABEL) in active_deployments:
                continue
            if labels.get(SERVICE_LABEL) in active_services:
                continue
            if labels.get(COMPOSE_PROJECT_LABEL) in active_projects:
                continue
            container.reload()
            if container.status not in {"exited", "dead", "created"}:
                continue
            if _created_epoch(container.attrs.get("Created")) >= cutoff:
                continue
            try:
                container.remove(force=True, v=False)
                removed += 1
            except (APIError, NotFound) as error:
                logger.warning("Could not remove stale container %s: %s", container.name, error)
        return removed

    def _clean_images(self, active_projects: set[str], active_image_tags: set[str], cutoff: float) -> int:
        removed = 0
        for image in self.client.images.list():
            tags = image.tags or []
            composeship_tags = [tag for tag in tags if tag.split(":", 1)[0].startswith("oc-")]
            if not composeship_tags or any(tag in active_image_tags for tag in composeship_tags):
                continue
            if any(tag.split(":", 1)[0].startswith(f"{project}-") for project in active_projects for tag in composeship_tags):
                continue
            if _created_epoch(image.attrs.get("Created")) >= cutoff:
                continue
            for tag in composeship_tags:
                try:
                    self.client.images.remove(image=tag, force=False, noprune=False)
                    removed += 1
                except (APIError, NotFound) as error:
                    logger.warning("Could not remove stale image %s: %s", tag, error)
        return removed

    def _prune_build_cache(self) -> int:
        hours = max(1, CLEANUP_BUILD_CACHE_MAX_AGE_SECONDS // 3600)
        completed = subprocess.run(
            ["docker", "builder", "prune", "-af", "--filter", f"until={hours}h"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
        if completed.returncode != 0:
            logger.warning("Build cache cleanup failed: %s", completed.stdout.strip())
            return 0
        return 1
