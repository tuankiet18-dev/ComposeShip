from pathlib import Path
import os
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "scripts" / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


def api_path(url: str) -> str:
    parsed = urlparse(url)
    return parsed.path


def run():
    issues = []
    visited = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()

        page.on("pageerror", lambda exc: issues.append(f"pageerror: {exc}"))

        def on_console(msg):
            if msg.type in {"error", "warning"}:
                text = msg.text
                if "Failed to load resource" not in text:
                    issues.append(f"console {msg.type}: {text}")

        page.on("console", on_console)

        def mock_api(route, request):
            path = api_path(request.url)
            if path == "/api/auth/me":
                route.fulfill(
                    status=200,
                    json={
                        "id": "user-1",
                        "email": "tester@example.com",
                        "fullName": "Test User",
                        "createdAt": "2026-05-23T00:00:00Z",
                    },
                )
            elif path == "/api/projects":
                if request.method == "GET":
                    route.fulfill(
                        status=200,
                        json=[
                            {
                                "id": "project-1",
                                "name": "Demo Project",
                                "description": "Smoke-test project",
                                "status": "live",
                                "deploymentMode": "SingleService",
                                "serviceCount": 1,
                                "createdAt": "2026-05-23T00:00:00Z",
                                "updatedAt": "2026-05-23T00:00:00Z",
                            }
                        ],
                    )
                elif request.method == "POST":
                    route.fulfill(status=201, json={"id": "project-2", "name": "Created"})
                else:
                    route.fulfill(status=204, body="")
            elif path == "/api/projects/project-1":
                route.fulfill(
                    status=200,
                    json={
                        "id": "project-1",
                        "name": "Demo Project",
                        "description": "Smoke-test project",
                        "status": "live",
                        "deploymentMode": "SingleService",
                        "serviceCount": 1,
                        "composeConfig": None,
                        "recentProjectDeployments": [],
                        "services": [
                            {
                                "id": "service-1",
                                "name": "web",
                                "serviceType": "frontend",
                                "detectedStack": "React",
                                "status": "live",
                                "liveUrl": "https://example.test",
                            }
                        ],
                        "createdAt": "2026-05-23T00:00:00Z",
                        "updatedAt": "2026-05-23T00:00:00Z",
                    },
                )
            elif path == "/api/services/service-1":
                route.fulfill(
                    status=200,
                    json={
                        "id": "service-1",
                        "projectId": "project-1",
                        "name": "web",
                        "repoUrl": "https://github.com/example/web",
                        "branch": "main",
                        "subfolder": None,
                        "serviceType": "frontend",
                        "detectedStack": "React",
                        "networkAliases": None,
                        "containerId": "container-1",
                        "status": "live",
                        "liveUrl": "https://example.test",
                        "environmentVariables": [],
                        "recentDeployments": [
                            {
                                "id": "deployment-1",
                                "status": "live",
                                "version": 3,
                                "startedAt": "2026-05-23T00:00:00Z",
                                "completedAt": "2026-05-23T00:01:12Z",
                                "createdAt": "2026-05-23T00:00:00Z",
                                "hasDiagnosticSnapshot": False,
                                "hasAiDiagnosis": False,
                            }
                        ],
                        "createdAt": "2026-05-23T00:00:00Z",
                        "updatedAt": "2026-05-23T00:00:00Z",
                    },
                )
            elif path == "/api/deployments/deployment-1/logs":
                route.fulfill(
                    status=200,
                    json={
                        "deploymentId": "deployment-1",
                        "status": "live",
                        "buildLogs": "INFO Build completed\\nINFO Service is live",
                    },
                )
            else:
                route.fulfill(status=404, json={"message": f"Unhandled mock route: {path}"})

        page.route("**/api/**", mock_api)

        checks = [
            ("/", "ComposeShip"),
            ("/login", "Welcome back"),
            ("/register", "Create your account"),
            ("/dashboard", "Welcome back, Test"),
            ("/projects", "Projects"),
        ]

        for path, text in checks:
            page.goto(f"{BASE_URL}{path}", wait_until="networkidle")
            expect(page.get_by_text(text).first).to_be_visible(timeout=10_000)
            page.screenshot(path=str(ARTIFACTS / f"{path.strip('/').replace('/', '_') or 'home'}.png"), full_page=True)
            visited.append(path)

        page.goto(f"{BASE_URL}/projects/new", wait_until="networkidle")
        expect(page.get_by_role("heading", name="New project")).to_be_visible()
        page.get_by_label("Project name").fill("Created by smoke test")
        page.get_by_label("Description").fill("Form interaction verified")
        expect(page.get_by_role("button", name="Create project")).to_be_enabled()
        page.screenshot(path=str(ARTIFACTS / "new_project.png"), full_page=True)

        browser.close()

    print("VISITED=" + ",".join(visited))
    print("ARTIFACTS=" + str(ARTIFACTS))
    if issues:
        print("ISSUES:")
        for issue in issues:
            print("- " + issue)
        raise SystemExit(1)
    print("ISSUES=none")


if __name__ == "__main__":
    run()
