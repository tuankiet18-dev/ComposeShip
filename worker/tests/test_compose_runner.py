import os
import sys

import pytest
import yaml

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules.compose_runner import (
    _wait_for_quick_tunnel_url,
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


def test_wait_for_quick_tunnel_url_parses_trycloudflare_url():
    assert _wait_for_quick_tunnel_url(_FakeTunnelContainer(), "cf-test", timeout=1) == "https://unit-test.trycloudflare.com"
