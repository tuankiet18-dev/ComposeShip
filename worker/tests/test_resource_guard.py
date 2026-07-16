import os
import time

import pytest

from modules import resource_guard


def test_disk_guard_retries_cleanup_then_blocks(monkeypatch, tmp_path):
    snapshots = iter(
        [
            {"total": 100, "free": 5, "free_percent": 5.0},
            {"total": 100, "free": 6, "free_percent": 6.0},
        ]
    )
    monkeypatch.setattr(resource_guard, "disk_snapshot", lambda _: next(snapshots))
    monkeypatch.setattr(resource_guard, "DISK_MIN_FREE_BYTES", 10)
    monkeypatch.setattr(resource_guard, "DISK_MIN_FREE_PERCENT", 10)
    monkeypatch.setattr(resource_guard, "DISK_CLEANUP_FREE_PERCENT", 20)
    called = []

    with pytest.raises(resource_guard.DiskPressureError, match="safe build watermark"):
        resource_guard.ensure_build_capacity(lambda: called.append(True), str(tmp_path))
    assert called == [True]


class _EmptyCollection:
    def list(self, **kwargs):
        return []


class _NoVolumeAccess:
    def list(self, **kwargs):
        raise AssertionError("Periodic cleaner must never enumerate or remove volumes")


class _FakeClient:
    containers = _EmptyCollection()
    images = _EmptyCollection()
    volumes = _NoVolumeAccess()


class _FakeManagedContainer:
    def __init__(self, service_id):
        self.labels = {
            resource_guard.MANAGED_LABEL: "true",
            resource_guard.SERVICE_LABEL: service_id,
        }
        self.status = "exited"
        self.attrs = {"Created": "2020-01-01T00:00:00Z"}
        self.name = f"service-{service_id}"
        self.removed = False

    def reload(self):
        return None

    def remove(self, force=True, v=False):
        self.removed = True


class _ContainerCollection:
    def __init__(self, containers):
        self.containers = containers

    def list(self, **kwargs):
        return self.containers


class _ClientWithContainers(_FakeClient):
    def __init__(self, containers):
        self.containers = _ContainerCollection(containers)


def test_cleaner_removes_only_stale_inactive_workspaces(monkeypatch, tmp_path):
    now = time.time()
    active = tmp_path / "active-deployment"
    stale = tmp_path / "stale-deployment"
    recent = tmp_path / "recent-deployment"
    active.mkdir()
    stale.mkdir()
    recent.mkdir()
    os.utime(active, (now - 100000, now - 100000))
    os.utime(stale, (now - 100000, now - 100000))
    monkeypatch.setattr(resource_guard, "CLEANUP_ARTIFACT_MAX_AGE_SECONDS", 3600)
    monkeypatch.setattr(resource_guard, "below_cleanup_watermark", lambda _: False)

    cleaner = resource_guard.PeriodicCleaner(client=_FakeClient(), workspace_dir=str(tmp_path), clock=lambda: now)
    report = cleaner.run({"activeDeploymentIds": ["active-deployment"]}, force=True)

    assert active.exists()
    assert recent.exists()
    assert not stale.exists()
    assert report["workspaces"] == 1


def test_cleaner_lock_prevents_parallel_cleanup(monkeypatch, tmp_path):
    monkeypatch.setattr(resource_guard, "below_cleanup_watermark", lambda _: False)
    cleaner = resource_guard.PeriodicCleaner(client=_FakeClient(), workspace_dir=str(tmp_path))
    cleaner.workspace_dir.mkdir(parents=True, exist_ok=True)

    with cleaner.lock_path.open("a+") as lock_file:
        resource_guard.fcntl.flock(lock_file.fileno(), resource_guard.fcntl.LOCK_EX | resource_guard.fcntl.LOCK_NB)
        report = cleaner.run({}, force=True)

    assert report == {"workspaces": 0, "containers": 0, "images": 0, "cache_bytes": 0}


def test_cleaner_preserves_db_active_service_container(monkeypatch, tmp_path):
    active = _FakeManagedContainer("active-service")
    stale = _FakeManagedContainer("stale-service")
    monkeypatch.setattr(resource_guard, "below_cleanup_watermark", lambda _: False)
    cleaner = resource_guard.PeriodicCleaner(
        client=_ClientWithContainers([active, stale]),
        workspace_dir=str(tmp_path),
    )

    report = cleaner.run({"activeServiceIds": ["active-service"]}, force=True)

    assert not active.removed
    assert stale.removed
    assert report["containers"] == 1
