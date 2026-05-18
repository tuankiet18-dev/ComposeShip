# OneClick-Host - Tai Lieu Ky Thuat

## 1. Tong quan

OneClick-Host la mot nen tang PaaS tu host, cho phep nguoi dung tao project, khai bao service tu GitHub repository, bam deploy va nhan ve URL live. He thong tu dong clone repository, phat hien stack, tao Dockerfile neu can, build Docker image, chay container va tao routing qua Traefik.

Repo duoc to chuc theo mo hinh monorepo:

| Khu vuc | Cong nghe | Vai tro |
|---|---|---|
| `frontend/` | Next.js 16, React 19, Tailwind CSS 4, shadcn-style UI | Dashboard, auth UI, quan ly project/service/deployment |
| `backend/OneClickHost.Api/` | ASP.NET Core, .NET 10, EF Core, PostgreSQL, JWT | REST API, auth, CRUD, tao deployment job |
| `worker/` | Python 3.12, psycopg2, GitPython, Docker SDK, PyYAML | Poll DB, clone repo, detect stack, build image, run container, cleanup |
| `traefik/` | Traefik v3.4 | Reverse proxy va dynamic routing |
| `scripts/` | SQL/shell helper | Tham chieu schema va helper migration |

Kien truc hien tai uu tien don gian cho MVP: API va Worker giao tiep thong qua PostgreSQL, khong dung message broker. Worker xu ly deployment tuan tu theo polling loop.

## 2. Cau truc thu muc quan trong

```text
oneClick-/
  docker-compose.yml
  .env.example
  README.md
  implementation_plan.md
  assets/
  backend/
    Dockerfile
    OneClickHost.Api/
      Program.cs
      Data/AppDbContext.cs
      Models/
      DTOs/
      Services/
      Controllers/
      Migrations/
  frontend/
    Dockerfile
    package.json
    next.config.ts
    src/
      app/
      lib/
      types/
      components/ui/
  worker/
    Dockerfile
    main.py
    config.py
    db.py
    modules/
    templates/
    tests/
  traefik/
    traefik.yml
    dynamic/dashboard.yml
  docs/testing/
  scripts/init-db.sql
```

## 3. Runtime architecture

Luot chay local mac dinh duoc dinh nghia trong `docker-compose.yml` voi project name co dinh la `oneclick`, tao network `oneclick_oneclick-net`.

Thanh phan runtime:

| Service Compose | Container | Port host | Ghi chu |
|---|---|---:|---|
| `db` | `oneclick-db` | `5433 -> 5432` | PostgreSQL 16 Alpine, co healthcheck |
| `traefik` | `oneclick-traefik` | `80`, `8081 -> 8080` | Reverse proxy va dashboard |
| `api` | `oneclick-api` | `5000` | ASP.NET Core API, auto migrate DB |
| `worker` | `oneclick-worker` | none | Can Docker socket de build/run container |
| `frontend` | `oneclick-frontend` | `3000` | Next.js dashboard |

Luot truy cap chinh:

```text
Browser
  -> Frontend http://localhost:3000
  -> API direct http://localhost:5000/api
  -> Hoac qua Traefik http://localhost/api

Worker
  -> PostgreSQL de lay job va cap nhat status
  -> GitHub/public Git repo de clone source
  -> Docker Engine qua /var/run/docker.sock de build/run containers
  -> Traefik dynamic file provider qua /etc/traefik/dynamic
```

## 4. Deployment pipeline

Pipeline bat dau khi nguoi dung bam Deploy tren dashboard.

1. Frontend goi `POST /api/services/{serviceId}/deploy`.
2. Backend `DeploymentService.TriggerDeploymentAsync` kiem tra service thuoc user hien tai.
3. Backend tao record `Deployments` voi `Status = queued`, tang `Version` dua tren deployment truoc do.
4. Backend set `Services.Status = queued`.
5. Worker polling `fetch_queued_deployment()` lay deployment cu nhat dang `queued`.
6. Worker update deployment sang `cloning`, set `StartedAt = NOW()`.
7. Worker clone repo bang GitPython, co ho tro `Branch` va `Subfolder`.
8. Worker detect stack tu file trong source.
9. Worker tao Dockerfile tu template neu repo chua co Dockerfile.
10. Worker build Docker image bang Docker SDK.
11. Worker lay env vars cua service tu DB.
12. Worker dung container cu cung ten, xoa Traefik config cu.
13. Worker tao container moi, connect vao network Traefik, gan aliases, start container.
14. Worker tao file route YAML trong `traefik/dynamic`.
15. Worker cap nhat deployment thanh `live`, service thanh `live`, luu `ContainerId`, `LiveUrl`.
16. Worker mark cac deployment `live` cu cua cung service thanh `superseded`.

Neu loi xay ra, worker:

| Thao tac | Ket qua |
|---|---|
| Ghi exception va traceback vao `BuildLogs` | Dashboard co the xem logs |
| Set deployment `Status = failed` | Co `CompletedAt` |
| Set service `Status = failed` | Dong thoi clear `LiveUrl` va `ContainerId` |
| Cleanup workspace | Xoa thu muc clone tam |

## 5. Backend API

### 5.1 Startup va middleware

`Program.cs` cau hinh:

| Hang muc | Chi tiet |
|---|---|
| Database | `AppDbContext` dung Npgsql, connection string `DefaultConnection` |
| Auth | JWT Bearer, validate issuer, audience, lifetime, signing key |
| DI | `AuthService`, `ProjectService`, `ServiceService`, `DeploymentService` |
| CORS | Doc `Cors:AllowedOrigins`, default `http://localhost:3000` |
| Swagger | Bat khi environment khong phai Production |
| Migration | Goi `db.Database.Migrate()` khi app start |
| Health | `GET /health` tra `{ status, timestamp }` |

### 5.2 Authentication

User dang ky va dang nhap bang email/password. Password duoc hash bang BCrypt. JWT token gom cac claim:

| Claim | Noi dung |
|---|---|
| `ClaimTypes.NameIdentifier` | User ID |
| `ClaimTypes.Email` | Email |
| `ClaimTypes.Name` | Full name |

`AuthController`:

| Method | Endpoint | Auth | Chuc nang |
|---|---|---|---|
| POST | `/api/auth/register` | No | Tao user, tra token |
| POST | `/api/auth/login` | No | Verify password, tra token |
| GET | `/api/auth/me` | JWT | Lay profile user hien tai |

### 5.3 Projects

`ProjectsController` yeu cau JWT cho tat ca endpoint.

| Method | Endpoint | Chuc nang |
|---|---|---|
| GET | `/api/projects` | Lay danh sach project cua user |
| POST | `/api/projects` | Tao project |
| GET | `/api/projects/{id}` | Lay project detail kem services |
| DELETE | `/api/projects/{id}` | Xoa project va cascade services/deployments/env vars |

Tat ca query deu filter theo `UserId`, tranh truy cap project cua user khac.

### 5.4 Services

`ServicesController` dung route explicit thay vi route prefix class.

| Method | Endpoint | Chuc nang |
|---|---|---|
| GET | `/api/projects/{projectId}/services` | List service trong project |
| POST | `/api/projects/{projectId}/services` | Tao service |
| GET | `/api/services/{id}` | Lay service detail |
| PUT | `/api/services/{id}` | Update config service |
| DELETE | `/api/services/{id}` | Mark service `deleting` |
| GET | `/api/services/{serviceId}/env` | Lay env vars, secret bi mask |
| PUT | `/api/services/{serviceId}/env` | Replace toan bo env vars |

Delete service khong xoa DB ngay. API chi set `Status = deleting`; Worker poll status nay de stop container, xoa route va xoa DB record.

### 5.5 Deployments

`DeploymentsController`:

| Method | Endpoint | Chuc nang |
|---|---|---|
| POST | `/api/services/{serviceId}/deploy` | Queue deployment moi |
| GET | `/api/services/{serviceId}/deployments` | List deployments cua service |
| GET | `/api/deployments/{id}` | Lay metadata deployment |
| GET | `/api/deployments/{id}/logs` | Lay build logs |

Status hien tai duoc dung boi backend/worker:

| Entity | Status |
|---|---|
| Service | `created`, `queued`, `deploying`, `live`, `stopped`, `failed`, `deleting` |
| Deployment | `queued`, `cloning`, `building`, `deploying`, `live`, `failed`, `superseded` |

Luu y: TypeScript type trong frontend hien chua khai bao day du `queued`, `deleting`, `superseded`.

## 6. Data model

### 6.1 Entity relationships

```text
User 1--N Project
Project 1--N Service
Service 1--N Deployment
Service 1--N EnvironmentVariable
```

Tat ca relationship con duoc cau hinh `OnDelete(DeleteBehavior.Cascade)` trong EF Core.

### 6.2 Tables

`Users`

| Column | Type logic | Ghi chu |
|---|---|---|
| `Id` | Guid | Primary key |
| `Email` | string max 255 | Unique index |
| `PasswordHash` | text | BCrypt hash |
| `FullName` | string max 100 | Required |
| `CreatedAt`, `UpdatedAt` | DateTime UTC | Default tu code |

`Projects`

| Column | Type logic | Ghi chu |
|---|---|---|
| `Id` | Guid | Primary key |
| `UserId` | Guid | FK Users |
| `Name` | string max 100 | Required |
| `Description` | string max 500 nullable | Optional |
| `CreatedAt`, `UpdatedAt` | DateTime UTC | Default tu code |

`Services`

| Column | Type logic | Ghi chu |
|---|---|---|
| `Id` | Guid | Primary key |
| `ProjectId` | Guid | FK Projects |
| `Name` | string max 100 | Dung de tao container name va URL |
| `RepoUrl` | string max 500 | Git clone URL |
| `Branch` | string max 100 | Default `main` |
| `Subfolder` | string max 255 nullable | Ho tro monorepo |
| `ServiceType` | string max 20 | `frontend` hoac `backend`, hien chu yeu phuc vu UI |
| `NetworkAliases` | string max 500 nullable | Comma-separated aliases cho Docker network |
| `DetectedStack` | string max 30 nullable | Do worker cap nhat |
| `ContainerId` | string max 100 nullable | Docker short id |
| `LiveUrl` | string max 500 nullable | URL public qua Traefik |
| `Status` | string max 20 | Trang thai service |
| `CreatedAt`, `UpdatedAt` | DateTime UTC | Default tu code |

`Deployments`

| Column | Type logic | Ghi chu |
|---|---|---|
| `Id` | Guid | Primary key |
| `ServiceId` | Guid | FK Services |
| `Status` | string max 20 | Trang thai job |
| `ImageTag` | string max 200 nullable | Vi du `oneclick-project-service:v1` |
| `ErrorMessage` | string max 2000 nullable | Loi ngan gon |
| `BuildLogs` | text nullable | Log build/deploy dang blob |
| `Version` | int | Tang theo service |
| `StartedAt`, `CompletedAt` | DateTime nullable | Do worker cap nhat |
| `CreatedAt` | DateTime UTC | Default tu code |

`EnvironmentVariables`

| Column | Type logic | Ghi chu |
|---|---|---|
| `Id` | Guid | Primary key |
| `ServiceId` | Guid | FK Services |
| `Key` | string max 255 | Env key |
| `Value` | string max 2000 | Luu plain text hien tai |
| `IsSecret` | bool | Chi mask khi tra API |
| `CreatedAt` | DateTime UTC | Default tu code |

## 7. Worker internals

### 7.1 Polling loop

`worker/main.py` chay vong lap vo han:

```text
while True:
  conn = get_connection()
  deployment = fetch_queued_deployment(conn)
  if deployment:
    process_deployment(conn, deployment)
  process_deleting_services(conn)
  conn.close()
  sleep(POLL_INTERVAL)
```

`fetch_queued_deployment()` dung:

```sql
SELECT ...
WHERE d."Status" = 'queued'
ORDER BY d."CreatedAt" ASC
LIMIT 1
FOR UPDATE OF d SKIP LOCKED
```

Cach nay cho phep mo rong sang nhieu worker trong tuong lai, vi cac worker tranh lay trung cung mot deployment.

### 7.2 Clone repository

`repo_cloner.clone_repo()`:

| Input | Y nghia |
|---|---|
| `repo_url` | Git repository URL |
| `branch` | Branch clone |
| `subfolder` | Neu co thi tra ve thu muc con |
| `deployment_id` | Tao workspace rieng |

Workspace mac dinh: `/tmp/oneclick-workspace/{deployment_id}/repo`.

Clone dung `depth=1` de nhanh hon. Neu `subfolder` khong ton tai, ham raise `FileNotFoundError`.

### 7.3 Stack detection

Thu tu detect trong `stack_detector.py`:

| Thu tu | Stack | Dieu kien |
|---:|---|---|
| 1 | `aspnet` | Co `.csproj`, co `Program.cs`, `.csproj` chua `Microsoft.NET.Sdk.Web` |
| 2 | `springboot-maven` | Co `pom.xml` va noi dung chua `spring-boot` |
| 3 | `springboot-gradle` | Co `build.gradle` hoac `build.gradle.kts` va chua `org.springframework.boot` |
| 4 | `nextjs` | Co `package.json` va dependency `next`, hoac co `next.config.*` |
| 5 | `react` | Co `react` va co `react-scripts` hoac `vite` |

Neu khong match stack nao, worker raise `ValueError`, deployment fail.

### 7.4 Dockerfile generation

`dockerfile_generator.generate_dockerfile()` map stack sang template:

| Stack | Template |
|---|---|
| `aspnet` | `worker/templates/aspnet.Dockerfile` |
| `springboot-maven` | `worker/templates/springboot-maven.Dockerfile` |
| `springboot-gradle` | `worker/templates/springboot-gradle.Dockerfile` |
| `nextjs` | `worker/templates/nextjs.Dockerfile` |
| `react` | `worker/templates/react.Dockerfile` |

Neu repo da co `Dockerfile`, worker uu tien Dockerfile cua user va khong copy template.

### 7.5 Build image

`build_runner.build_image()` dung Docker SDK:

```python
client.images.build(
    path=source_path,
    tag=image_tag,
    rm=True,
    forcerm=True,
)
```

Image tag format:

```text
oneclick-{project_name}-{service_name}:v{version}
```

Ten container format:

```text
oc-{project_name}-{service_name}
```

Ca hai duoc lowercase va thay space bang `-`.

### 7.6 Run container va routing

`run_container()`:

1. Stop/remove container cu cung ten.
2. Xoa Traefik dynamic config cu.
3. Tao container moi voi:
   - `mem_limit = CONTAINER_MEMORY_LIMIT`, default `256m`
   - `nano_cpus = CONTAINER_CPU_LIMIT * 1e9`, default `0.5 CPU`
   - `restart_policy = unless-stopped`
   - environment tu DB
   - Traefik labels
4. Connect container vao `TRAEFIK_NETWORK`.
5. Gan aliases: container name + `NetworkAliases`.
6. Start container va verify status la `running`.
7. Detect exposed port dau tien, default `80`.
8. Ghi Traefik file provider config:

```yaml
http:
  routers:
    router_name:
      rule: Host(`service-project.domain`)
      service: router_name
      entryPoints:
        - web
  services:
    router_name:
      loadBalancer:
        servers:
          - url: http://container_name:port
```

URL live format:

```text
http://{service_name}-{project_name}.{TRAEFIK_DOMAIN}
```

Voi default local:

```text
http://frontend-myproject.localhost
```

### 7.7 Delete cleanup

Khi API set service `deleting`, worker:

1. Lay services dang `deleting`.
2. Tinh container name tu project/service.
3. Stop/remove container neu ton tai.
4. Remove Traefik config.
5. Delete DB record trong `Services`.

## 8. Frontend

### 8.1 App Router pages

| Route | File | Chuc nang |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing page |
| `/login` | `src/app/(auth)/login/page.tsx` | Dang nhap |
| `/register` | `src/app/(auth)/register/page.tsx` | Dang ky |
| `/dashboard` | `src/app/dashboard/page.tsx` | Overview, quick stats, guide |
| `/dashboard/projects` | `src/app/dashboard/projects/page.tsx` | List/create/delete projects |
| `/dashboard/projects/[id]` | `src/app/dashboard/projects/[id]/page.tsx` | Project detail, create service, deploy |
| `/dashboard/projects/[id]/services/[serviceId]` | `src/app/dashboard/projects/[id]/services/[serviceId]/page.tsx` | Service detail, deployments, logs, env/settings view |

### 8.2 Auth state

`src/lib/auth.tsx` dung React Context:

| State | Noi dung |
|---|---|
| `user` | `{ id, email, fullName }` |
| `isLoading` | Dang doc localStorage |
| `login()` | Goi API login, luu `token` va `user` vao localStorage |
| `register()` | Goi API register, luu `token` va `user` |
| `logout()` | Xoa localStorage, clear user |

Dashboard layout redirect ve `/login` neu khong co user.

### 8.3 API client

`src/lib/api.ts` la wrapper fetch:

| Hanh vi | Chi tiet |
|---|---|
| Base URL | `NEXT_PUBLIC_API_URL` hoac `http://localhost:5000/api` |
| Auth header | Tu dong them `Authorization: Bearer {token}` neu co |
| 401 | Xoa localStorage va redirect `/login` |
| Error | Doc `{ message }` neu co, fallback `API Error: status` |
| 204 | Tra object rong |

### 8.4 UI state va gaps

Frontend hien co:

| Tinh nang | Trang thai |
|---|---|
| Login/register | Co |
| Project CRUD | Create/list/delete co, update chua co |
| Service create | Co |
| Service deploy | Co |
| Deployment logs | Co view logs theo click |
| Env vars | Chi hien thi trong service detail, chua co UI edit |
| Service update/delete UI | API co, UI detail chua co nut update/delete |
| Status polling realtime | Chua co auto polling trong service detail sau khi deploy |

## 9. Docker va infrastructure

### 9.1 Backend Dockerfile

`backend/Dockerfile` la multi-stage:

1. SDK `mcr.microsoft.com/dotnet/sdk:10.0`
2. Restore project.
3. Copy source va `dotnet publish -c Release`.
4. Runtime `mcr.microsoft.com/dotnet/aspnet:10.0`.
5. Expose `5000`, entrypoint `OneClickHost.Api.dll`.

### 9.2 Frontend Dockerfile

`frontend/Dockerfile` la multi-stage:

1. `deps`: `npm ci`
2. `builder`: `npm run build`
3. `runner`: copy Next standalone output, chay user `nextjs`
4. Expose `3000`, `CMD ["node", "server.js"]`

`next.config.ts` bat `output: "standalone"` de Docker runtime nhe hon.

### 9.3 Worker Dockerfile

`worker/Dockerfile`:

1. Base `python:3.12-slim`
2. Cai `git`
3. Cai Docker CLI tu Docker apt repo
4. `pip install -r requirements.txt`
5. Copy worker source
6. Tao workspace `/tmp/oneclick-workspace`
7. Run `python main.py`

Worker container mount `/var/run/docker.sock`, nen co quyen dieu khien Docker Engine cua host.

### 9.4 Traefik

`traefik/traefik.yml`:

| Cau hinh | Gia tri |
|---|---|
| Dashboard | `api.dashboard=true`, `api.insecure=true` |
| EntryPoints | `web :80`, `websecure :443` |
| Provider active | File provider `/etc/traefik/dynamic`, `watch=true` |
| Docker provider | Dang comment, de bat trong Linux production |
| Access log | `/etc/traefik/access.log` |

`traefik/dynamic/dashboard.yml` route:

| Router | Rule | Service |
|---|---|---|
| `api-router` | `Host(localhost) && PathPrefix(/api)` | `http://api:5000` |
| `frontend-router` | `Host(localhost)` | `http://frontend:3000` |

## 10. Cau hinh moi truong

`.env.example` gom cac nhom:

| Nhom | Bien quan trong |
|---|---|
| PostgreSQL | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` |
| API | `ASPNETCORE_ENVIRONMENT`, `CONNECTION_STRING`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRY_HOURS`, `CORS_ORIGINS` |
| Worker | `WORKER_POLL_INTERVAL`, `WORKER_BUILD_TIMEOUT`, `DOCKER_HOST`, `WORKSPACE_DIR`, `CONTAINER_MEMORY_LIMIT`, `CONTAINER_CPU_LIMIT` |
| Frontend | `NEXT_PUBLIC_API_URL` |
| Traefik | `TRAEFIK_DOMAIN` |
| Compose/network | `COMPOSE_PROJECT_NAME`, `TRAEFIK_NETWORK` |

Luu y mismatch ten bien:

| Trong `.env.example` | Trong `docker-compose.yml` truyen vao worker | Trong `worker/config.py` doc |
|---|---|---|
| `WORKER_POLL_INTERVAL` | `POLL_INTERVAL` | `POLL_INTERVAL` |
| `WORKER_BUILD_TIMEOUT` | `BUILD_TIMEOUT` | `BUILD_TIMEOUT` |

Docker Compose map dung sang ten worker can, nen runtime compose van hoat dong.

## 11. Test va validation hien co

Worker co test stack detection va Dockerfile generation:

| File | Muc dich |
|---|---|
| `worker/tests/test_stack_and_dockerfile.py` | Pytest cho detect stack va generate Dockerfile |
| `worker/tests/validate_pipeline.py` | Script chay detection, generation, Docker build va tao report |
| `docs/testing/stack_and_dockerfile_validation_report.md` | Report validation hien co |

Fixtures:

```text
worker/tests/fixtures/
  aspnet/
  nextjs/
  react/
  springboot-gradle/
  springboot-maven/
  unsupported/
```

Ket qua report hien co:

| Fixture | Detection | Docker build |
|---|---|---|
| aspnet | Pass | Pass |
| springboot-maven | Pass | Pass |
| springboot-gradle | Pass | Fail do fixture thieu Java main class |
| nextjs | Pass | Fail do fixture thieu build script |
| react | Pass | Fail do fixture thieu build script |
| unsupported | Pass | N/A |

## 12. Lenh van hanh

### 12.1 Local full stack

```bash
docker compose up -d --build
```

Endpoints local:

| Dich vu | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| API Swagger | `http://localhost:5000/swagger` |
| API health | `http://localhost:5000/health` |
| Traefik dashboard | `http://localhost:8081` |
| Traefik frontend route | `http://localhost` |
| Traefik API route | `http://localhost/api` |

### 12.2 Backend

```bash
cd backend/OneClickHost.Api
dotnet restore
dotnet build
dotnet run
```

### 12.3 Frontend

```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

### 12.4 Worker tests

```bash
cd worker
python -m pytest tests/test_stack_and_dockerfile.py
python tests/validate_pipeline.py
```

## 13. Bao mat va rui ro ky thuat

| Rui ro | Trang thai hien tai | De xuat |
|---|---|---|
| Docker socket mounted vao worker | Worker co quyen rat cao tren host Docker | Chi deploy trusted workloads, tach host build ve sau |
| User code arbitrary execution | Bat buoc khi PaaS build/run repo cua user | Sandbox build, resource quotas, network policy |
| Secrets luu plain text | `EnvironmentVariables.Value` chua ma hoa | Ma hoa truoc khi luu DB, dung KMS/DPAPI/secret manager |
| Traefik dashboard insecure | `api.insecure=true` | Tat trong production, them auth middleware |
| JWT secret default trong config | Co default de dev | Bat buoc set secret manh qua env production |
| No HTTPS production config | `websecure` co entrypoint nhung chua ACME | Them Let's Encrypt/ACME va redirect HTTP -> HTTPS |
| Cleanup project cascade khong cleanup containers | Delete project xoa DB cascade, khong qua status `deleting` tung service | Can workflow cleanup containers truoc khi xoa project |
| ASP.NET Dockerfile template ENTRYPOINT wildcard | `ENTRYPOINT ["dotnet", "*.dll"]` khong expand wildcard trong exec form | Template aspnet co nguy co fail neu duoc dung cho user apps |
| Build timeout config chua dung | `BUILD_TIMEOUT` duoc doc nhung Docker SDK build chua ap timeout | Implement timeout quanh build |
| Frontend type status chua day du | Types thieu `queued`, `deleting`, `superseded` | Dong bo enum/type voi backend/worker |

## 14. Cac diem can chu y trong code hien tai

1. Encoding trong mot so file bi loi hien thi.
   - README, comments va UI text co ky tu dang `ðŸ...`, `â€”`, `â€¢`.
   - Khong anh huong logic, nhung can normalize UTF-8 neu muon tai lieu/UI sach.

2. `scripts/init-db.sql` chi la safety net.
   - Schema chinh do EF Core migrations tao.
   - SQL script hien chua co column `NetworkAliases`, trong khi migration moi co.

3. `run_migration.sh` xoa `bin/ obj/` theo path hien tai.
   - Neu chay sai thu muc co the khong dung y do.
   - Nen document ro phai chay trong `backend/OneClickHost.Api`.

4. API auto-migrate khi startup.
   - Tien cho dev/demo.
   - Production nen can nhac migration pipeline rieng de tranh app startup lam thay doi schema ngoai y muon.

5. Worker chi xu ly mot deployment moi vong lap.
   - Tot cho MVP va may nho.
   - Can queue/concurrency control neu nhieu user.

6. Frontend khong tu dong poll deployment status sau khi bam deploy.
   - User can reload/navigation hoac bam lai de thay status moi.
   - Nen them polling hoac SSE/WebSocket.

## 15. Mo rong de xuat

| Huong mo rong | Ly do |
|---|---|
| Redis/RabbitMQ queue | Giam polling DB, ho tro retry/concurrency ro rang |
| SSE/WebSocket logs | Log realtime thay vi chi xem snapshot |
| GitHub OAuth/PAT | Clone private repositories |
| Project deletion cleanup workflow | Dam bao xoa project cung cleanup containers/routes |
| Secret encryption | Bao ve env vars trong DB |
| Custom domains + HTTPS | San sang production |
| Deployment rollback | Chay lai image version truoc |
| Build cache strategy | Tang toc build Node/Java/.NET |
| Container health checks | Chi mark live khi app ready |
| Runtime logs | Khac voi build logs, can `docker logs` hoac log collector |

## 16. Tom tat luong chinh

```text
User register/login
  -> Frontend stores JWT in localStorage
  -> User creates Project
  -> User creates Service with repo/branch/subfolder/aliases
  -> User clicks Deploy
  -> API creates Deployment queued
  -> Worker picks queued job
  -> Clone repository
  -> Detect stack
  -> Use existing Dockerfile or generated template
  -> Build Docker image
  -> Stop previous container
  -> Run new container with env/resource limits/network aliases
  -> Write Traefik dynamic route
  -> Mark deployment/service live
  -> Frontend displays live URL and logs
```

