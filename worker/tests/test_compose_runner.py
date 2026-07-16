import os
import sys

import pytest
import yaml

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules.compose_runner import (
    _wait_for_quick_tunnel_url,
    cleanup_compose_stack,
    prepare_compose_file,
    write_traefik_routes,
)


def _write_compose(tmp_path, content: dict):
    compose_file = tmp_path / "docker-compose.yml"
    compose_file.write_text(yaml.safe_dump(content), encoding="utf-8")
    return str(compose_file)


def test_prepare_compose_blocks_docker_socket_mount(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {
                "api": {
                    "image": "example/api",
                    "volumes": ["/var/run/docker.sock:/var/run/docker.sock"],
                }
            }
        },
    )

    with pytest.raises(RuntimeError, match="Blocked absolute host bind mount"):
        prepare_compose_file(
            compose_file,
            str(tmp_path),
            "project-1",
            "deployment-1",
            "oc-project",
            [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000}],
            [],
        )


def test_prepare_compose_rejects_source_bind_mount_at_nested_app_path(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {
                "api": {
                    "build": ".",
                    "volumes": ["./src:/src/ChatApp.API"],
                }
            }
        },
    )
    (tmp_path / "src").mkdir()

    with pytest.raises(RuntimeError, match="Local bind mount"):
        prepare_compose_file(
            compose_file,
            str(tmp_path),
            "project-1",
            "deployment-1",
            "oc-project",
            [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000}],
            [],
        )


def test_prepare_compose_keeps_named_data_volume(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {
                "postgres": {
                    "image": "postgres:16-alpine",
                    "volumes": ["postgres_data:/var/lib/postgresql/data"],
                }
            },
            "volumes": {"postgres_data": {}},
        },
    )

    sanitized_file, _ = prepare_compose_file(
        compose_file,
        str(tmp_path),
        "project-1",
        "deployment-1",
        "oc-project",
        [],
        [],
    )

    with open(sanitized_file, encoding="utf-8") as f:
        sanitized = yaml.safe_load(f)
    assert sanitized["services"]["postgres"]["volumes"] == ["postgres_data:/var/lib/postgresql/data"]
    assert sanitized["services"]["postgres"]["cap_drop"] == ["ALL"]
    assert sanitized["services"]["postgres"]["cap_add"] == [
        "CHOWN", "FOWNER", "SETUID", "SETGID", "DAC_OVERRIDE", "NET_BIND_SERVICE"
    ]


def test_prepare_compose_enforces_platform_resource_and_log_limits(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {
                "api": {
                    "image": "example/api",
                    "mem_limit": "8g",
                    "cpus": "8",
                    "pids_limit": 4096,
                    "deploy": {"replicas": 20},
                    "logging": {"driver": "json-file", "options": {"max-size": "10g"}},
                }
            }
        },
    )

    sanitized_file, _ = prepare_compose_file(
        compose_file,
        str(tmp_path),
        "project-1",
        "deployment-1",
        "oc-project",
        [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000}],
        [],
    )

    with open(sanitized_file, encoding="utf-8") as f:
        service = yaml.safe_load(f)["services"]["api"]
    assert service["mem_limit"] == "256m"
    assert service["cpus"] == "0.5"
    assert service["pids_limit"] == 256
    assert "deploy" not in service
    assert service["logging"]["options"] == {"max-size": "10m", "max-file": "3"}


def test_cleanup_stop_preserves_named_volumes(monkeypatch):
    client = _FakeCleanupClient()
    monkeypatch.setattr("modules.compose_runner._client", lambda: client)
    monkeypatch.setattr("modules.compose_runner.remove_traefik_routes", lambda _: None)
    monkeypatch.setattr("modules.compose_runner.remove_cloudflare_quick_tunnels", lambda _: None)

    cleanup_compose_stack("oc-project", remove_volumes=False)

    assert client.container.removed
    assert client.network.removed
    assert not client.volume.removed


def test_cleanup_delete_removes_named_volumes(monkeypatch):
    client = _FakeCleanupClient()
    monkeypatch.setattr("modules.compose_runner._client", lambda: client)
    monkeypatch.setattr("modules.compose_runner.remove_traefik_routes", lambda _: None)
    monkeypatch.setattr("modules.compose_runner.remove_cloudflare_quick_tunnels", lambda _: None)

    cleanup_compose_stack("oc-project", remove_volumes=True)

    assert client.volume.removed


def test_prepare_compose_blocks_external_volumes(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {"api": {"image": "example/api"}},
            "volumes": {"shared": {"external": True}},
        },
    )

    with pytest.raises(RuntimeError, match="Blocked external volume"):
        prepare_compose_file(
            compose_file,
            str(tmp_path),
            "project-1",
            "deployment-1",
            "oc-project",
            [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000}],
            [],
        )


def test_prepare_compose_blocks_external_networks_and_namespace_sharing(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {"api": {"image": "example/api"}},
            "networks": {"other-project": {"external": True}},
        },
    )
    with pytest.raises(RuntimeError, match="Blocked external network"):
        prepare_compose_file(compose_file, str(tmp_path), "project-1", "deployment-1", "oc-project", [], [])

    compose_file = _write_compose(
        tmp_path,
        {"services": {"api": {"image": "example/api", "network_mode": "service:other"}}},
    )
    with pytest.raises(RuntimeError, match="Blocked unsafe namespace mode"):
        prepare_compose_file(compose_file, str(tmp_path), "project-1", "deployment-1", "oc-project", [], [])


def test_prepare_compose_exposes_only_routed_services_for_execution_node(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {
                "api": {"image": "example/api", "ports": ["8000:8000"]},
                "db": {"image": "postgres:16-alpine", "ports": ["5432:5432"]},
            }
        },
    )

    sanitized_file, _ = prepare_compose_file(
        compose_file,
        str(tmp_path),
        "project-1",
        "deployment-1",
        "oc-project",
        [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000}],
        [{"serviceName": "api", "key": "DATABASE_URL", "value": "postgres://db/app", "isSecret": False}],
        expose_route_ports=True,
    )

    with open(sanitized_file, encoding="utf-8") as f:
        sanitized = yaml.safe_load(f)
    assert "ports" in sanitized["services"]["api"]
    assert sanitized["services"]["api"]["ports"][0]["target"] == 8000
    assert "ports" not in sanitized["services"]["db"]
    assert sanitized["services"]["api"]["environment"]["DATABASE_URL"] == "postgres://db/app"
    assert "composeship-public" not in sanitized["networks"]
    assert sanitized["services"]["api"]["cap_drop"] == ["ALL"]
    assert sanitized["services"]["api"]["cap_add"] == ["NET_BIND_SERVICE"]
    assert sanitized["services"]["api"]["security_opt"] == ["no-new-privileges:true"]


def test_prepare_compose_injects_matching_non_secret_build_args(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {
            "services": {
                "frontend": {
                    "build": {
                        "context": ".",
                        "dockerfile": "Dockerfile",
                        "args": {
                            "VITE_API_BASE_URL": "http://localhost:5185",
                            "JWT_SIGNING_KEY": "default",
                        },
                    },
                }
            }
        },
    )

    sanitized_file, logs = prepare_compose_file(
        compose_file,
        str(tmp_path),
        "project-1",
        "deployment-1",
        "oc-project",
        [{"serviceName": "frontend", "routeSlug": "app", "internalPort": 80}],
        [
            {
                "serviceName": "frontend",
                "key": "VITE_API_BASE_URL",
                "value": "http://api-chat.localhost",
                "isSecret": False,
            },
            {
                "serviceName": "frontend",
                "key": "JWT_SIGNING_KEY",
                "value": "super-secret",
                "isSecret": True,
            },
        ],
    )

    with open(sanitized_file, encoding="utf-8") as f:
        sanitized = yaml.safe_load(f)

    build_args = sanitized["services"]["frontend"]["build"]["args"]
    assert build_args["VITE_API_BASE_URL"] == "http://api-chat.localhost"
    assert build_args["JWT_SIGNING_KEY"] == "default"
    assert sanitized["services"]["frontend"]["environment"]["JWT_SIGNING_KEY"] == "super-secret"
    assert "Injected environment variable 'VITE_API_BASE_URL' into build args for service 'frontend'." in logs


def test_prepare_compose_does_not_publish_cloudflare_quick_route_ports(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {"services": {"api": {"image": "example/api", "ports": ["8000:8000"]}}},
    )

    sanitized_file, _ = prepare_compose_file(
        compose_file,
        str(tmp_path),
        "project-1",
        "deployment-1",
        "oc-project",
        [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000, "exposureProvider": "cloudflare_quick"}],
        [],
        expose_route_ports=True,
    )

    with open(sanitized_file, encoding="utf-8") as f:
        sanitized = yaml.safe_load(f)
    assert "ports" not in sanitized["services"]["api"]
    assert "composeship-tunnel" in sanitized["networks"]
    assert "composeship-tunnel" in sanitized["services"]["api"]["networks"]


def test_prepare_compose_rejects_unknown_exposure_provider(tmp_path):
    compose_file = _write_compose(
        tmp_path,
        {"services": {"api": {"image": "example/api"}}},
    )

    with pytest.raises(RuntimeError, match="Unsupported exposure provider"):
        prepare_compose_file(
            compose_file,
            str(tmp_path),
            "project-1",
            "deployment-1",
            "oc-project",
            [{"serviceName": "api", "routeSlug": "api", "internalPort": 8000, "exposureProvider": "bad"}],
            [],
        )


def test_write_traefik_routes_skips_cloudflare_quick_routes(tmp_path, monkeypatch):
    monkeypatch.setattr("modules.compose_runner.DYNAMIC_DIR", str(tmp_path))

    urls = write_traefik_routes(
        "oc-project",
        "Demo",
        [
            {"serviceName": "api", "routeSlug": "api", "internalPort": 8000, "exposureProvider": "cloudflare_quick"},
            {"serviceName": "web", "routeSlug": "app", "internalPort": 3000, "exposureProvider": "traefik"},
        ],
    )

    assert urls == ["http://app-demo.localhost"]
    assert (tmp_path / "compose-oc-project-app.yml").exists()
    assert not (tmp_path / "compose-oc-project-api.yml").exists()


class _FakeTunnelContainer:
    status = "running"

    def reload(self):
        return None

    def logs(self, stdout=True, stderr=True, tail=120):
        return b"Your quick Tunnel has been created! https://unit-test.trycloudflare.com"


class _FakeImage:
    id = "image-1"
    tags = ["oc-project-api:latest"]
    attrs = {"Config": {"Labels": {}}}


class _FakeContainer:
    name = "oc-project-api-1"
    status = "running"
    image = _FakeImage()
    removed = False

    def stop(self, timeout=10):
        self.status = "exited"

    def remove(self, force=True, v=False):
        self.removed = True


class _FakeVolume:
    name = "oc-project_data"
    removed = False

    def remove(self, force=True):
        self.removed = True


class _FakeNetwork:
    name = "oc-project_default"
    removed = False

    def remove(self):
        self.removed = True


class _FakeCollection:
    def __init__(self, item):
        self.item = item

    def list(self, **kwargs):
        return [] if self.item.removed else [self.item]


class _FakeImages:
    def __init__(self):
        self.image = _FakeImage()
        self.removed = False

    def list(self):
        return [] if self.removed else [self.image]

    def remove(self, **kwargs):
        self.removed = True


class _FakeCleanupClient:
    def __init__(self):
        self.container = _FakeContainer()
        self.volume = _FakeVolume()
        self.network = _FakeNetwork()
        self.containers = _FakeCollection(self.container)
        self.volumes = _FakeCollection(self.volume)
        self.networks = _FakeCollection(self.network)
        self.images = _FakeImages()


def test_wait_for_quick_tunnel_url_parses_trycloudflare_url():
    assert _wait_for_quick_tunnel_url(_FakeTunnelContainer(), "cf-test", timeout=1) == "https://unit-test.trycloudflare.com"
