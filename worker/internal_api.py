import json
import logging
import urllib.error
import urllib.request

from config import (
    CONTROL_PLANE_API_URL,
    EXECUTION_NODE_ARCHITECTURE,
    EXECUTION_NODE_ID,
    EXECUTION_NODE_LABELS,
    EXECUTION_NODE_NAME,
    EXECUTION_NODE_PRIVATE_HOST,
    EXECUTION_NODE_REGISTRATION_TOKEN,
    EXECUTION_NODE_TOKEN,
    MAX_CONCURRENT_BUILDS,
)

logger = logging.getLogger(__name__)


class ExecutionNodeClient:
    def __init__(self):
        self.base_url = CONTROL_PLANE_API_URL.rstrip("/")
        self.node_id = EXECUTION_NODE_ID.strip()
        self.token = EXECUTION_NODE_TOKEN.strip()
        if not self.token:
            raise RuntimeError("EXECUTION_NODE_TOKEN is required in executor mode.")

    def _request(self, method: str, path: str, body: dict | None = None) -> dict:
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "Content-Type": "application/json",
                "X-OneClick-Node-Token": self.token,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read().decode("utf-8")
                return json.loads(payload) if payload else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Control-plane API error {exc.code}: {detail}") from exc

    def ensure_registered(self):
        if self.node_id:
            return
        if not EXECUTION_NODE_REGISTRATION_TOKEN:
            raise RuntimeError("EXECUTION_NODE_ID or EXECUTION_NODE_REGISTRATION_TOKEN is required in executor mode.")
        if not EXECUTION_NODE_PRIVATE_HOST:
            raise RuntimeError("EXECUTION_NODE_PRIVATE_HOST is required in executor mode.")

        response = self._request(
            "POST",
            "/execution-nodes/register",
            {
                "name": EXECUTION_NODE_NAME,
                "publicOrPrivateBaseUrl": f"http://{EXECUTION_NODE_PRIVATE_HOST}",
                "architecture": EXECUTION_NODE_ARCHITECTURE,
                "labels": EXECUTION_NODE_LABELS,
                "maxConcurrentBuilds": MAX_CONCURRENT_BUILDS,
                "agentToken": self.token,
                "registrationToken": EXECUTION_NODE_REGISTRATION_TOKEN,
            },
        )
        self.node_id = response["id"]
        logger.info("Registered execution node %s (%s)", EXECUTION_NODE_NAME, self.node_id)

    def heartbeat(self, current_builds: int = 0, status: str = "active"):
        return self._request(
            "POST",
            f"/execution-nodes/{self.node_id}/heartbeat",
            {"currentBuilds": current_builds, "status": status},
        )

    def lease(self, current_builds: int = 0, status: str = "active") -> dict:
        return self._request(
            "POST",
            f"/execution-nodes/{self.node_id}/lease",
            {
                "availableSlots": max(0, MAX_CONCURRENT_BUILDS - current_builds),
                "labels": EXECUTION_NODE_LABELS,
                "currentBuilds": current_builds,
                "status": status,
            },
        )

    def event(self, deployment_id: str, body: dict):
        return self._request(
            "POST",
            f"/execution-nodes/{self.node_id}/deployments/{deployment_id}/events",
            body,
        )

    def route_target(self, body: dict):
        return self._request("POST", f"/execution-nodes/{self.node_id}/route-targets", body)
