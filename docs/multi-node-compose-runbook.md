# Runbook Compose Deploy Multi-Node

Runbook này mô tả phase đầu để OneClickHost chạy Compose deploy trên hai VM
cùng VPC/private network. App route của người dùng dùng HTTP qua `sslip.io`.
HTTPS/ACME và Cloudflare Tunnel để phase sau.

## 1. Fixture Public GitHub

Fixture repo:

```text
https://github.com/tuankiet18-dev/oneclick-compose-fixture
```

Cấu hình trong OneClickHost:

| Field | Value |
|---|---|
| Branch | `main` |
| Compose file | `docker-compose.yml` |
| Route `app` | service `frontend`, port `3000` |
| Route `api` | service `api`, port `8000` |
| Env `api.DATABASE_URL` | `postgresql://oneclick:oneclick@db:5432/oneclick_fixture` |

Kỳ vọng:

- frontend public route tải được HTML;
- API `/health` trả `status=ok`;
- API `/db-check` trả `database=ok`, chứng minh API gọi DB qua service name `db`;
- DB không có public route.

## 2. Sinh Secret Và Env

Trên máy Linux hoặc VM control-plane:

```bash
make generate-execution-secrets
CONTROL_PLANE_PUBLIC_IP=<public-ip-control-plane> \
CONTROL_PLANE_PRIVATE_IP=<private-ip-control-plane> \
EXECUTION_NODE_PRIVATE_IP=<private-ip-execution-node> \
make render-multinode-env
```

Kết quả nằm trong:

```text
.generated/multinode/control-plane.env
.generated/multinode/execution-node.env
```

Không commit các file trong `.generated/`.
Execution-node sẽ gọi control-plane qua `http://<private-ip-control-plane>:5000/api`;
dashboard và app route public vẫn đi qua `http://<public-ip-control-plane>.sslip.io`.

## 3. Local E2E Giả Lập

Local mode vẫn có thể kiểm tra phần lớn flow bằng hai compose project trên cùng
máy:

```bash
docker compose --env-file .generated/multinode/control-plane.env up -d --build
docker compose -p oneclick-execution -f docker-compose.execution.yml --env-file .generated/multinode/execution-node.env up -d --build
```

Nếu chạy trên Docker Desktop, có thể đặt:

```bash
CONTROL_PLANE_PUBLIC_IP=127.0.0.1
CONTROL_PLANE_API_BIND=127.0.0.1
CONTROL_PLANE_API_HOST=host.docker.internal
CONTROL_PLANE_POSTGRES_PASSWORD=12345
EXECUTION_NODE_PRIVATE_IP=host.docker.internal
```

`CONTROL_PLANE_API_BIND` phải là IP thật để Docker bind port `5000`; không dùng
hostname ở biến này. `CONTROL_PLANE_API_HOST` là hostname/IP mà execution-node
container dùng để gọi control-plane API. Trên Docker Desktop Windows/macOS, giá
trị này thường là `host.docker.internal`.
`CONTROL_PLANE_POSTGRES_PASSWORD=12345` chỉ cần khi reuse volume local đã tạo từ
file `.env` dev hiện tại. Nếu muốn dùng password random mới từ generated secrets,
chạy `docker compose down -v` trước để tạo lại PostgreSQL volume sạch.

Local có thể khác Linux VM thật ở phần private firewall, nhưng đủ để kiểm tra:
registration, heartbeat, lease, build Compose, route target và cleanup.

Khi kiểm tra execution-node, luôn dùng cùng project name:

```bash
docker compose -p oneclick-execution -f docker-compose.execution.yml ps
docker compose -p oneclick-execution -f docker-compose.execution.yml logs -f worker
```

Repo local có thể có `.env` với `COMPOSE_PROJECT_NAME=oneclick`; nếu bỏ `-p
oneclick-execution`, Docker Compose sẽ nhìn nhầm sang control-plane project.

## 4. Control-Plane VM

Control-plane chạy:

- API;
- PostgreSQL;
- frontend dashboard;
- Traefik route registry.

Firewall tối thiểu:

- public inbound: `80`, SSH từ IP admin;
- private inbound từ execution-node: `5000`;
- không mở PostgreSQL public;
- port `5433` và `3000` chỉ bind loopback trong env generated.

Phase đầu dùng:

```text
TRAEFIK_DOMAIN=<control-plane-public-ip>.sslip.io
```

Chạy:

```bash
cp .generated/multinode/control-plane.env .env
docker compose up -d --build
```

## 5. Execution-Node VM

Execution-node chạy worker executor và Docker daemon. Đây là nơi chạy workload
người dùng, không đặt DB/API secret dài hạn của control-plane ngoài token executor.

Firewall tối thiểu:

- outbound tới control-plane API HTTP;
- inbound published app ports chỉ từ private IP control-plane;
- SSH từ IP admin.

Chạy:

```bash
cp .generated/multinode/execution-node.env .env
docker compose -f docker-compose.execution.yml up -d --build
```

## 6. Deploy Fixture Qua UI

Trong dashboard OneClickHost:

1. Tạo project.
2. Mở tab Compose.
3. Inspect repo `https://github.com/tuankiet18-dev/oneclick-compose-fixture`.
4. Save routes:
   - `app -> frontend:3000`;
   - `api -> api:8000`.
5. Save env `api.DATABASE_URL`.
6. Deploy stack.

URL kỳ vọng:

```text
http://app-<project>.<control-plane-public-ip>.sslip.io
http://api-<project>.<control-plane-public-ip>.sslip.io/health
http://api-<project>.<control-plane-public-ip>.sslip.io/db-check
```

## 7. Smoke Test

Sau khi có URL app/API:

```bash
CONTROL_PLANE_API_URL=http://<control-plane-public-ip>.sslip.io/api \
APP_URL=http://app-<project>.<control-plane-public-ip>.sslip.io \
APP_API_URL=http://api-<project>.<control-plane-public-ip>.sslip.io \
make smoke-compose-multinode
```

Nếu biết `EXECUTION_NODE_ID`, có thể thêm:

```bash
EXECUTION_NODE_ID=<node-id> EXECUTION_NODE_TOKEN=<token>
```

## 8. Failure Cases Bắt Buộc

Trước khi coi là vận hành được, kiểm tra:

- Compose có Docker socket mount bị reject;
- Compose có `privileged`, host network, absolute bind mount bị reject;
- tắt execution worker giữa deploy để lease timeout/retry hoạt động;
- redeploy project để route target cũ thành stale/superseded;
- stop/delete project để route/container/volume bị dọn đúng phạm vi.

## 9. Validation Checklist

```bash
make validate
make fixture-config
```

Các lệnh này kiểm tra backend build, worker tests, frontend lint/build, compose
config control-plane, compose config execution-node và compose config fixture.

## 10. Troubleshooting Local Build

Nếu `docker compose up --build` lỗi ở bước pull metadata, ví dụ:

```text
failed to resolve source metadata for mcr.microsoft.com/dotnet/aspnet:10.0
failed to do request: Head "...": EOF
```

Đây thường là lỗi kết nối tạm thời từ Docker/BuildKit tới registry, không phải lỗi
code. Chạy trước:

```bash
make pull-base-images
docker compose up -d --build
```

Với local dev nên dùng `-d`; nếu không, `docker compose up --build` sẽ attach vào
logs và trông như bị treo dù service đã chạy.
