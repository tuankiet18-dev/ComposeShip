import os
import sys

import pytest
import yaml

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules.compose_runner import prepare_compose_file


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
