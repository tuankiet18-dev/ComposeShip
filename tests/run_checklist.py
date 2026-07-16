import requests
import string
import random
import time
import subprocess
import sys
import os
import re

API_BASE = os.getenv("API_BASE", "http://localhost:5000/api").rstrip("/")
EXPOSURE_PROVIDER = os.getenv("E2E_EXPOSURE_PROVIDER", "traefik").lower()

# Track results for the final report
results = []

def print_result(step_name, success, message=""):
    status_str = "[PASS]" if success else "[FAIL]"
    print(f"{status_str} {step_name} {message}")
    results.append({"step": step_name, "success": success, "message": message})

def random_string(length=10):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def run_docker_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout, result.stderr, result.returncode

def create_invite():
    command = os.getenv(
        "ONECLICK_E2E_INVITE_COMMAND",
        "docker compose exec -T api dotnet OneClickHost.Api.dll --invite create --expires-hours 2 --note e2e-checklist",
    )
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    output = f"{result.stdout}\n{result.stderr}"
    match = re.search(r"Invite code \(shown once\):\s*([A-F0-9]{40})", output)
    if result.returncode != 0 or not match:
        raise RuntimeError(f"Could not provision test invite. Command: {command}\n{output}")
    return match.group(1)

def wait_for_project_status(project_id, headers, desired_status, timeout=120):
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get(f"{API_BASE}/projects/{project_id}", headers=headers)
        if r.status_code == 200:
            status = r.json().get("status")
            if status == desired_status:
                return True
            print(f"  ... current status: {status}")
        elif r.status_code == 404 and desired_status == "deleted":
            return True
        time.sleep(5)
    return False

def wait_for_api_ready(timeout=60):
    health_url = API_BASE.removesuffix("/api") + "/health"
    start = time.time()
    while time.time() - start < timeout:
        try:
            if requests.get(health_url, timeout=3).status_code == 200:
                return True
        except requests.RequestException:
            pass
        time.sleep(1)
    return False

def main():
    print("========================================")
    print("      ONECLICKHOST QA TEST RUNNER       ")
    print("========================================\n")

    if not wait_for_api_ready():
        print("Fatal error: API did not become ready within 60 seconds.")
        sys.exit(1)

    print("--- Phase 1: Accounts ---")
    email_a = f"test_{random_string(5)}@example.com"
    pwd_valid = "Test1234"
    
    # 1. Đăng ký hợp lệ qua one-time invite, giống chính xác pilot flow.
    invite_a = create_invite()
    res = requests.post(f"{API_BASE}/auth/register", json={"email": email_a, "password": pwd_valid, "fullName": "Test User A", "inviteCode": invite_a, "acceptedPilotTerms": True})
    print_result("Register valid account (202)", res.status_code == 202, f"Code: {res.status_code}")
    
    # 2. Đăng nhập
    res = requests.post(f"{API_BASE}/auth/login", json={"email": email_a, "password": pwd_valid})
    print_result("Login successfully (200)", res.status_code == 200, f"Code: {res.status_code}")
    
    if res.status_code != 200:
        print("Fatal error: Could not log in. Aborting.")
        sys.exit(1)
        
    token_a = res.json().get('token')
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 3. Mật khẩu dưới 8 ký tự
    res = requests.post(f"{API_BASE}/auth/register", json={"email": f"t_{random_string(5)}@ex.com", "password": "Test1", "fullName": "T", "inviteCode": invite_a, "acceptedPilotTerms": True})
    print_result("Reject password < 8 chars", res.status_code == 400)
    
    # 4. Mật khẩu thiếu chữ hoa, thường, số
    res = requests.post(f"{API_BASE}/auth/register", json={"email": f"t_{random_string(5)}@ex.com", "password": "testpassword1", "fullName": "T", "inviteCode": invite_a, "acceptedPilotTerms": True})
    print_result("Reject invalid password format", res.status_code == 400)

    # 5. Đăng ký lại cùng email -> 202
    res = requests.post(f"{API_BASE}/auth/register", json={"email": email_a, "password": pwd_valid, "fullName": "Test User A", "inviteCode": invite_a, "acceptedPilotTerms": True})
    print_result("Duplicate email returns 202", res.status_code == 202)

    # 6. Rate limit 429
    hit_429 = False
    for _ in range(10):
        r = requests.post(f"{API_BASE}/auth/register", json={"email": f"t_{random_string(5)}@ex.com", "password": pwd_valid, "fullName": "T", "inviteCode": invite_a, "acceptedPilotTerms": True})
        if r.status_code == 429:
            hit_429 = True
            break
    print_result("Rate limiting triggers 429", hit_429)

    print("Note: Sleeping 60s to wait for Auth rate limit reset before creating User B...")
    time.sleep(60)

    # Create User B with a separate one-time invite.
    email_b = f"test_{random_string(5)}@example.com"
    invite_b = create_invite()
    requests.post(f"{API_BASE}/auth/register", json={"email": email_b, "password": pwd_valid, "fullName": "User B", "inviteCode": invite_b, "acceptedPilotTerms": True})
    res = requests.post(f"{API_BASE}/auth/login", json={"email": email_b, "password": pwd_valid})
    token_b = res.json().get('token')
    headers_b = {"Authorization": f"Bearer {token_b}"}

    print("\n--- Phase 2: Quota ---")
    projects_a = []
    # User A creates 3 projects
    for i in range(3):
        r = requests.post(f"{API_BASE}/projects", json={"name": f"Proj-{i}"}, headers=headers_a)
        if r.status_code == 201:
            projects_a.append(r.json().get('id'))
    print_result("User A creates 3 projects", len(projects_a) == 3)

    # User A creates 4th -> 409
    r = requests.post(f"{API_BASE}/projects", json={"name": "Proj-4"}, headers=headers_a)
    print_result("4th project creation returns 409", r.status_code == 409, f"Code: {r.status_code}")

    # Isolation: A cannot see B's project
    r = requests.post(f"{API_BASE}/projects", json={"name": "Proj-B"}, headers=headers_b)
    project_b_id = r.json().get('id')
    r = requests.get(f"{API_BASE}/projects/{project_b_id}", headers=headers_a)
    print_result("Account isolation (A cannot access B)", r.status_code in [403, 404])

    print("\n--- Phase 2.5: Compose Safety ---")
    fixture_repo = "https://github.com/tuankiet18-dev/oneclick-compose-fixture"
    project_a_id = projects_a[0]
    
    # Inspect
    r = requests.post(f"{API_BASE}/projects/{project_a_id}/compose-inspect", 
                      json={"repoUrl": fixture_repo, "branch": "main", "subfolder": ""}, 
                      headers=headers_a)
    inspect_data = r.json()
    services_found = [s['name'] for s in inspect_data.get('services', [])] if inspect_data.get('services') else []
    has_three = set(['frontend', 'api', 'db']).issubset(set(services_found))
    print_result("Inspect finds frontend, api, db", has_three, f"Found: {services_found}")

    # Config Route & Env (Phase 2.5 limits check can be tested here, but we proceed with valid config)
    config_payload = {
        "repoUrl": fixture_repo,
        "branch": "main",
        "subfolder": "",
        "composeFile": "docker-compose.yml",
        "routes": [
            {"serviceName": "frontend", "routeSlug": "app", "internalPort": 3000, "exposureProvider": EXPOSURE_PROVIDER},
            {"serviceName": "api", "routeSlug": "api", "internalPort": 8000, "exposureProvider": EXPOSURE_PROVIDER}
        ],
        "environmentVariables": [
            {"serviceName": "api", "key": "DATABASE_URL", "value": "postgresql://oneclick:oneclick@db:5432/oneclick_fixture", "isSecret": False}
        ]
    }
    r = requests.put(f"{API_BASE}/projects/{project_a_id}/compose-config", json=config_payload, headers=headers_a)
    print_result("Save Compose config successfully", r.status_code == 200, f"Code: {r.status_code}")

    print("\n--- Phase 3: Deploy ---")
    r = requests.post(f"{API_BASE}/projects/{project_a_id}/deploy", headers=headers_a)
    print_result("Trigger deploy returns accepted", r.status_code in [200, 202], f"Code: {r.status_code}")
    
    print("Waiting for deployment to reach 'live' (timeout 90s)...")
    live_success = wait_for_project_status(project_a_id, headers_a, "live", 90)
    print_result("Deployment completed (live)", live_success)

    # Check only the containers that the worker created for this project. The
    # project-id label is an ownership boundary; Compose-generated names are not.
    project_label = f"com.oneclickhost.project-id={project_a_id}"
    out, err, code = run_docker_cmd(
        f"docker ps --filter label={project_label} --format '{{{{.Labels}}}}'"
    )
    print_result(
        "Docker containers are running",
        code == 0
        and "com.oneclickhost.compose-service=frontend" in out
        and "com.oneclickhost.compose-service=api" in out,
    )
    container_ids, err, code = run_docker_cmd(
        f"docker ps --filter label={project_label} --format '{{{{.ID}}}}'"
    )
    limit_output, err, limit_code = run_docker_cmd(
        "docker inspect " + container_ids.replace("\n", " ").strip()
        + " --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} "
        + "{{.HostConfig.PidsLimit}} {{json .HostConfig.LogConfig}}'"
        if container_ids.strip()
        else "false"
    )
    expected_log = '"max-size":"10m"' in limit_output and '"max-file":"3"' in limit_output
    every_container_capped = all(
        line.startswith("268435456 500000000 256 ")
        for line in limit_output.splitlines()
    )
    print_result(
        "Runtime containers enforce platform resource and log limits",
        limit_code == 0 and expected_log and every_container_capped,
    )

    print("\n--- Phase 3: Stop & Delete ---")
    print("Stopping worker to test intermediate state...")
    run_docker_cmd("docker compose stop worker")
    
    r = requests.post(f"{API_BASE}/projects/{project_a_id}/stop", headers=headers_a)
    print_result("Request stop project", r.status_code in [200, 202])
    
    time.sleep(3)
    r = requests.get(f"{API_BASE}/projects/{project_a_id}", headers=headers_a)
    print_result("Project is in 'stopping' state while worker is off", r.json().get('status') == "stopping")

    print("Starting worker to resume cleanup...")
    run_docker_cmd("docker compose start worker")
    
    print("Waiting for project to reach 'stopped'...")
    stopped_success = wait_for_project_status(project_a_id, headers_a, "stopped", 60)
    print_result("Project is 'stopped' after worker processes it", stopped_success)

    # Test Delete
    print("Stopping worker again to test delete intermediate state...")
    run_docker_cmd("docker compose stop worker")
    
    r = requests.delete(f"{API_BASE}/projects/{project_a_id}", headers=headers_a)
    print_result("Request delete project", r.status_code in [200, 202, 204])
    
    time.sleep(3)
    r = requests.get(f"{API_BASE}/projects/{project_a_id}", headers=headers_a)
    # Could be deleting or might return 404 immediately if logic changed, let's assume 'deleting'
    print_result("Project is in 'deleting' state while worker is off", r.status_code == 200 and r.json().get('status') == "deleting")

    print("Starting worker to resume delete...")
    run_docker_cmd("docker compose start worker")

    print("Waiting for project to disappear (404)...")
    deleted_success = wait_for_project_status(project_a_id, headers_a, "deleted", 60)
    print_result("Project completely deleted", deleted_success)

    # Cleanup must remove this project's containers without making assertions
    # about other users' active workloads.
    out, err, code = run_docker_cmd(
        f"docker ps -a --filter label={project_label} --format '{{{{.ID}}}}'"
    )
    print_result("No project containers left", code == 0 and not out.strip())
    
    # Cleanup dummy projects to leave state clean
    for pid in projects_a[1:]:
        requests.delete(f"{API_BASE}/projects/{pid}", headers=headers_a)
    requests.delete(f"{API_BASE}/projects/{project_b_id}", headers=headers_b)

    print("\n========================================")
    print("               SUMMARY                  ")
    print("========================================")
    passed = sum(1 for r in results if r['success'])
    total = len(results)
    print(f"Total Tests: {total} | Passed: {passed} | Failed: {total - passed}")

if __name__ == "__main__":
    main()
