# Local Multi-Node Compose Deploy On Windows

Tài liệu này hướng dẫn chạy giả lập OneClickHost multi-node trên Windows bằng
Docker Desktop. Mục tiêu là kiểm tra control-plane, execution-node, register,
heartbeat, lease job, build Compose, route target và Traefik HTTP route trước khi
đưa lên hai VM cùng VPC/private network.

## Mô Hình Local

```text
Browser
  -> http://127.0.0.1.sslip.io
  -> Traefik control-plane
  -> Frontend dashboard / API / route registry

Execution-node worker
  -> http://host.docker.internal:5000/api
  -> register / heartbeat / lease deployment jobs

User Compose app
  -> started by execution-node worker through Docker socket
  -> only selected routes are public
  -> db/cache services stay internal by Compose service name
```

Local Windows khác VM thật ở firewall/private IP, nhưng vẫn kiểm tra được phần
lớn logic ứng dụng.

## Prerequisites

- Docker Desktop đang chạy Linux containers.
- Git Bash hoặc WSL có lệnh `bash`.
- PowerShell mở tại root repo:

```powershell
cd D:\Documents\code\CSharp\OneClickHost\oneClick-
```

Nếu Docker Hub bị lỗi `EOF` khi pull image, pre-pull trước:

```powershell
docker pull postgres:16-alpine
docker pull mcr.microsoft.com/dotnet/sdk:10.0
docker pull mcr.microsoft.com/dotnet/aspnet:10.0
docker pull python:3.12-slim
docker pull node:20-alpine
docker pull nginx:1.27-alpine
docker pull traefik:v3.4
```

Nếu riêng Traefik bị kẹt qua Docker Hub/CloudFront, dùng mirror rồi tag lại:

```powershell
docker pull mirror.gcr.io/library/traefik:v3.4
docker tag mirror.gcr.io/library/traefik:v3.4 traefik:v3.4
```

## Start From Clean Runtime

Dừng hai compose project cũ:

```powershell
docker compose down
docker compose -p oneclick-execution -f docker-compose.execution.yml down
```

Nếu muốn reset cả database local:

```powershell
docker compose down -v
docker compose -p oneclick-execution -f docker-compose.execution.yml down -v
```

`down -v` sẽ xóa DB local. Nếu không reset volume, dùng password đang có trong
`.env` dev, thường là `12345`.

## Render Local Env

Chạy lệnh này cho Windows Docker Desktop:

```powershell
bash -lc "CONTROL_PLANE_PUBLIC_IP=127.0.0.1 CONTROL_PLANE_API_BIND=127.0.0.1 CONTROL_PLANE_API_HOST=host.docker.internal CONTROL_PLANE_POSTGRES_PASSWORD=12345 EXECUTION_NODE_PRIVATE_IP=host.docker.internal ./scripts/render-multinode-env.sh"
```

Kỳ vọng:

```text
.generated/multinode/control-plane.env
.generated/multinode/execution-node.env
```

Các giá trị quan trọng:

```text
TRAEFIK_DOMAIN=127.0.0.1.sslip.io
API_BIND=127.0.0.1
AUTO_MIGRATE_DATABASE=true
CONTROL_PLANE_API_URL=http://host.docker.internal:5000/api
COMPOSE_PROJECT_NAME=oneclick-execution
```

## Start Control-Plane

```powershell
docker compose -f docker-compose.control-plane.phase1.yml -f docker-compose.control-plane.local.yml --env-file .generated\multinode\control-plane.env up -d --build
```

Kiểm tra:

```powershell
docker compose -f docker-compose.control-plane.phase1.yml -f docker-compose.control-plane.local.yml --env-file .generated\multinode\control-plane.env ps
```

Kỳ vọng:

```text
oneclick-db         Up (healthy)
oneclick-api        Up
oneclick-frontend   Up
oneclick-traefik    Up
oneclick-worker     Up
```

Kiểm tra HTTP:

```powershell
curl http://127.0.0.1:5000/health
curl http://127.0.0.1.sslip.io
```

Cả hai trả HTTP `200`.

## Start Execution-Node

Luôn dùng `-p oneclick-execution` để không bị `.env` local override
`COMPOSE_PROJECT_NAME=oneclick`.

```powershell
docker compose -p oneclick-execution -f docker-compose.execution.yml --env-file .generated\multinode\execution-node.env up -d --build
```

Kiểm tra:

```powershell
docker compose -p oneclick-execution -f docker-compose.execution.yml --env-file .generated\multinode\execution-node.env ps
```

Kỳ vọng:

```text
oneclick-execution-worker-1   worker   Up
```

Xem log:

```powershell
docker compose -p oneclick-execution -f docker-compose.execution.yml --env-file .generated\multinode\execution-node.env logs -f worker
```

Kỳ vọng:

```text
OneClick-Host Worker started in executor mode
Registered execution node execution-node-1 (...)
```

## Test Fixture Deploy Qua UI

Mở dashboard:

```text
http://127.0.0.1.sslip.io
```

Trong project:

1. Mở tab `Compose stack`.
2. Chọn `Use fixture`.
3. Chọn `Inspect`.
4. Chọn `Save config`.
5. Chọn `Deploy stack`.

Fixture repo:

```text
https://github.com/tuankiet18-dev/oneclick-compose-fixture
```

Routes kỳ vọng:

```text
app -> frontend:3000
api -> api:8000
```

Env kỳ vọng:

```text
api.DATABASE_URL=postgresql://oneclick:oneclick@db:5432/oneclick_fixture
```

Khi deploy thành công, UI hiển thị execution node, route targets và public URL.
URL có dạng:

```text
http://app-<project-slug>.127.0.0.1.sslip.io
http://api-<project-slug>.127.0.0.1.sslip.io
```

Kiểm tra API route:

```powershell
curl http://api-<project-slug>.127.0.0.1.sslip.io/health
curl http://api-<project-slug>.127.0.0.1.sslip.io/db-check
```

Kỳ vọng:

- `/health` OK.
- `/db-check` OK.
- DB không có public route riêng.

## Troubleshooting

Nếu execution-node hiện control-plane services khi chạy `ps`, bạn đang thiếu
`-p oneclick-execution`.

Nếu execution-node restart với `relation "ExecutionNodes" does not exist`, đảm
bảo env có:

```text
AUTO_MIGRATE_DATABASE=true
```

Sau đó rebuild API:

```powershell
docker compose --env-file .generated\multinode\control-plane.env up -d --build api worker
```

Nếu API log báo `password authentication failed for user "oneclick"`, volume DB
đang dùng password cũ. Render lại env với:

```text
CONTROL_PLANE_POSTGRES_PASSWORD=12345
```

Hoặc reset volume bằng `docker compose down -v`.

Nếu Docker pull lỗi `EOF`, retry image hoặc dùng mirror Traefik như phần
Prerequisites.

## Stop

```powershell
docker compose down
docker compose -p oneclick-execution -f docker-compose.execution.yml down
```
