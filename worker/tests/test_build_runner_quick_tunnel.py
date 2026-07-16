import os
import sys

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules import build_runner


class DummyImages:
    def get(self, image):
        return object()


class DummyApi:
    def __init__(self):
        self.connected = []

    def connect_container_to_network(self, container_id, network, aliases=None):
        self.connected.append((container_id, network, aliases))


class DummyContainers:
    def __init__(self):
        self.created = []

    def list(self, all=False, filters=None):
        return []

    def get(self, name):
        raise build_runner.NotFound("missing")

    def create(self, **kwargs):
        container = DummyContainer(kwargs["name"])
        self.created.append(kwargs)
        return container


class DummyClient:
    def __init__(self):
        self.images = DummyImages()
        self.containers = DummyContainers()
        self.api = DummyApi()


class DummyContainer:
    def __init__(self, name):
        self.id = f"{name}-id"

    def start(self):
        pass


def test_create_cloudflare_quick_tunnel_targets_service_container(monkeypatch):
    client = DummyClient()
    monkeypatch.setattr(build_runner, "get_client", lambda: client)
    monkeypatch.setattr(build_runner, "_wait_for_quick_tunnel_url", lambda container, name: "https://demo.trycloudflare.com")

    url = build_runner._create_cloudflare_quick_tunnel(
        "oc-portfolio-web",
        "portfolio",
        "web",
        "service-1",
        80,
    )

    assert url == "https://demo.trycloudflare.com"
    created = client.containers.created[0]
    assert created["name"] == "cf-oc-portfolio-web"
    assert created["command"] == ["tunnel", "--no-autoupdate", "--url", "http://oc-portfolio-web:80"]
    assert created["labels"][build_runner.COMPOSESHIP_QUICK_TUNNEL_LABEL] == "true"
    assert created["labels"][build_runner.COMPOSESHIP_SERVICE_LABEL] == "service-1"
    assert client.api.connected == [("cf-oc-portfolio-web-id", build_runner.TRAEFIK_NETWORK, None)]
