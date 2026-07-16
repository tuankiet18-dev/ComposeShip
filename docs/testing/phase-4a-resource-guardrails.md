# Phase 4A Validation: Worker Resource Guardrails

Status: `PASS_LOCAL`

Date: 2026-07-12

## Implemented Controls

- A user may have one active project; the platform also limits active projects
  to `3` and queued deployments to `10` by default. PostgreSQL transaction
  advisory locks serialize the global and per-user check-plus-queue path.
- Capacity conflicts return `409`; temporary platform saturation returns `503`
  with `Retry-After: 60`.
- `GET /api/projects/runtime-capacity` returns only `available` or `busy` and a
  retry interval. It intentionally does not expose project names, tenant IDs,
  active counts, or queue depth. The dashboard shows this advisory state.
- The worker overwrites user Compose CPU, memory, PID, and logging settings:
  `0.5` CPU, `256m`, `256` PIDs, and Docker `json-file` logs of `10m x 3`.
- Before clone/build/deploy, the worker checks free bytes and free percentage.
  Defaults: block below `5 GiB` or `10%`; start cleanup below `20%` free.
- A periodic cleaner uses a host lock and DB inventory to preserve active
  deployments/services while removing only old inactive workspaces, stopped
  managed containers, old OneClick-built images, and aged build cache under
  disk pressure. It never enumerates or removes Docker volumes.
- Infrastructure container logs use the same `10m x 3` rotation policy.

## Local Evidence

The local fixture was deployed and deleted three times. The final two complete
cycles passed after the E2E selector and resource inspection were corrected.

| Check | Result |
|---|---|
| Backend console tests | `13/13 PASS` |
| Worker pytest | `56 passed` |
| Frontend lint and production build | PASS |
| Supported Compose topology validation | PASS (unset production secrets produce expected warnings) |
| Phase 1-3 lifecycle E2E with runtime inspection | `22/22 PASS` |
| API `/projects/runtime-capacity` smoke request | PASS |
| Local Traefik `/health` routing | PASS |
| Managed runtime after cleanup | none |
| Docker storage before/after final cycle | unchanged: images `11.27 GB`, containers `190.3 MB`, volumes `164.5 MB`, cache `2.585 GB` |

During the live fixture inspection, all three user containers (frontend, API,
database) had the following Docker host configuration:

```text
Memory: 268435456 (256 MiB)
NanoCpus: 500000000 (0.5 CPU)
PidsLimit: 256
LogConfig: json-file, max-size=10m, max-file=3
```

## Re-run Commands

```bash
$HOME/.local/bin/dotnet build backend/OneClickHost.Api.Tests/OneClickHost.Api.Tests.csproj --no-restore
$HOME/.local/bin/dotnet run --project backend/OneClickHost.Api.Tests/OneClickHost.Api.Tests.csproj --no-restore
docker run --rm -v "$PWD/worker:/app" -w /app oneclick-worker sh -lc \
  'pip install -q pytest && PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider tests'
npm --prefix frontend run lint && npm --prefix frontend run build
docker compose config -q
python3 tests/run_checklist.py
```

The checklist provisions one-time invites through the host-only invite CLI. It
waits for API readiness before the first request. For a reused local database,
temporarily raise only the local Docker value `INVITES_MAX_ACCOUNTS` so the two
test accounts fit; the release default remains `10`.

## Rollback

Revert the Phase 4A commit and recreate API/worker/frontend:

```bash
docker compose up -d --build api worker frontend
```

No migration or persisted schema change is introduced by this phase. Do not use
`docker system prune -a --volumes` as a rollback or cleanup mechanism.

## Remaining Release Blockers

Phase 4A is local-only evidence. Release remains `NO_GO` until later phases
complete: invite-only admission, production migrations and dependency/CI
audits, two-node isolation, HTTPS/origin controls, backup/restore, monitoring,
and AWS staging smoke tests. API Data Protection keys are also currently
ephemeral in local Compose and must be persisted and protected for production.
