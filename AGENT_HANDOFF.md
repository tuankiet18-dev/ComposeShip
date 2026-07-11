# Agent Handoff

This file is the shared coordination surface between Codex and Antigravity.
Use it to pass phase instructions, implementation reports, review feedback, and next-step approvals.

## Rules

1. Work on one phase at a time.
2. Antigravity must read this file before starting work.
3. Antigravity must update the `Antigravity Report` section after finishing a phase.
4. Codex must update the `Codex Review` section after reviewing a phase.
5. Do not start the next phase until `Review Decision` is `PASS`.
6. Keep reports factual: files changed, commands run, test output, blockers.
7. Do not store secrets, credentials, tokens, AWS keys, database passwords, or private URLs here.

## Current Phase

Phase: `3 - Compose Stop/Delete Runtime Cleanup`

Status: `READY_FOR_USER_VALIDATION`

Owner: `Codex`

Goal:
Keep projects visible and runtime slots reserved until worker-confirmed Compose cleanup succeeds.

## Phase Instructions For Antigravity

Implement Phase 2 only.

Scope:
- Add backend quota checks before queueing deployments.
- Enforce one active runtime project per user.
- Enforce small MVP caps for total projects, services, compose routes, and env vars.
- Return clear user-facing conflict/quota errors.
- Update frontend only where needed to surface these errors clearly.

Required backend targets:
- `backend/OneClickHost.Api/Services/QuotaService.cs` or equivalent new service.
- `backend/OneClickHost.Api/Services/ProjectService.cs`
- `backend/OneClickHost.Api/Services/DeploymentService.cs`
- `backend/OneClickHost.Api/Program.cs`
- `backend/OneClickHost.Api/appsettings.json`
- Related DTOs/controllers only if needed for clear error responses.

Endpoints/flows to protect:
- `POST /api/projects/{id}/deploy`
- `POST /api/services/{serviceId}/deploy`
- `POST /api/projects`
- `POST /api/projects/{id}/services`
- `PUT /api/projects/{id}/compose-config`

Constraints:
- Do not change worker cleanup behavior yet; that is Phase 3.
- Do not add billing or payment logic.
- Do not silently stop an existing project when deploying another project.
- Do not allow a second project to enter queued/building/deploying/live while another project is active.
- Do not block redeploy of the same currently active project.

Expected behavior:
- A user can deploy project A.
- While project A is `queued`, `cloning`, `building`, `deploying`, `live`, `unhealthy`, or `stopping`, deploying project B returns `409 Conflict`.
- Redeploying project A is allowed.
- After project A is `stopped`, `failed`, or `deleting`, deploying project B is allowed.
- Max total projects, max services/project, max compose routes/project, and max env vars/project are configurable.
- Error messages are actionable, e.g. "Stop your running project before deploying another one."

Suggested validation:
- `./dotnet/dotnet build backend/OneClickHost.Api/OneClickHost.Api.csproj`
- `./dotnet/dotnet run --project backend/OneClickHost.Api.Tests/OneClickHost.Api.Tests.csproj`
- Add or run tests for active project conflict and same-project redeploy.
- If frontend changes are made: `npm run lint` and `npm run build` in `frontend`.

## Phase 2 Plan Review

Plan Decision: `APPROVED_WITH_CONDITIONS`

Codex notes for Antigravity:
- The proposed `QuotaService` direction is approved. Begin implementation, but keep the change limited to Phase 2 runtime quota and clear quota errors.
- Use the current repo as source of truth. `implementation_plan.md` contains some older/general architecture text; do not infer framework/runtime changes from it.
- Active-project detection must cover project-level Compose deployments and the older service-level deployment path. A user must not be able to run project B through `POST /api/services/{serviceId}/deploy` while project A is active.
- Treat active statuses as: `queued`, `cloning`, `building`, `deploying`, `live`, `unhealthy`, `stopping`. Treat releasable/inactive statuses as: `stopped`, `failed`, `deleting`. Also account for current default statuses like `active`, `created`, or null-ish legacy values so brand-new projects do not consume the runtime slot before first deploy.
- Do not block redeploying the same active project. For service-level deploys, "same project" means another service under the same `ProjectId` may be redeployed during that project's active lifecycle.
- Add quota checks inside service methods before creating queued deployment rows, not only in controllers. Controllers should only translate expected quota exceptions into API responses.
- Prefer one consistent `QuotaExceededException` response shape with `{ "message": "<actionable message>" }` and `409 Conflict` for active-runtime conflicts and quota caps.
- Add max env-var checks for both compose env vars (`Project.ComposeEnvJson`) and classic service env vars (`Service.EnvironmentVariables` via `PUT /api/services/{serviceId}/env`), since both can consume memory/secrets storage.
- Be mindful of concurrent deploy requests. The MVP can start with a transactional check before queueing, but tests should at least cover the normal conflict path and same-project redeploy path. If a simple DB transaction can be added without broad refactor, use it around quota check plus queue insert.
- Do not add worker cleanup, billing, payment, automatic stop, or resource metering in this phase.

## Antigravity Report

Status: `READY_FOR_CODEX_REVIEW` (Round 2)

Summary:
- Fixed the two blockers mentioned in the previous review:
  1. `QuotaService.EnsureCanDeployProjectAsync` now checks both `Project.Status` and `Project.Services.Status` for active states (`queued, cloning, building, deploying, live, unhealthy, stopping`). This ensures that a service-level deployment correctly blocks a new project, and vice-versa.
  2. Added PostgreSQL advisory locks via `SELECT pg_advisory_xact_lock(1, {user_id_hash})` inside the existing transaction blocks in `ProjectService` and `DeploymentService`. This guarantees that concurrent deploy requests for the same user are serialized and cannot bypass the quota.
- Verified that `p.Id != currentProjectId` continues to allow redeploying the same active project.
- Built and ran test console successfully.

Files changed:
- `backend/OneClickHost.Api/Services/QuotaService.cs`: [MODIFY] Added `pg_advisory_xact_lock` and updated the active project LINQ query to include `p.Services.Any(...)`.

Commands run:
- `./dotnet/dotnet build backend/OneClickHost.Api/OneClickHost.Api.csproj`: Pass, 0 errors.
- `./dotnet/dotnet run --project backend/OneClickHost.Api.Tests/OneClickHost.Api.Tests.csproj`: Pass, test console success.

Test output:
- `Build succeeded.`
- `PASS parses core compose resources`
- `PASS classifies infrastructure services`
- `PASS maps compose services for services tab`
- `PASS returns empty graph for compose without services`

Known blockers:
- None.

Questions for Codex:
- Please verify the new concurrent and cross-mode (compose vs service) quota restrictions.

## Codex Review

Review Decision: `PASS`

Summary:
- Phase 2 passes after Round 2 fixes and Codex follow-up validation. Runtime quota now blocks cross-project deploys across both Compose and service-level paths, allows redeploys within the same active project, enforces configured project/service/route/env caps, and uses PostgreSQL advisory transaction locks to serialize same-user deploy attempts.

Findings:
- Resolved, `backend/OneClickHost.Api/Services/QuotaService.cs`: active-project detection now checks both `Project.Status` and active `Service.Status` values in other projects.
- Resolved, `backend/OneClickHost.Api/Services/QuotaService.cs`: deploy quota checks acquire a PostgreSQL transaction-scoped advisory lock per user when running on Npgsql. Codex adjusted the lock helper to skip non-Npgsql providers so InMemory tests can cover quota logic without production behavior changing.
- Added coverage, `backend/OneClickHost.Api.Tests/Program.cs`: quota tests now cover service-level active project blocking another project, compose active project blocking service-level deploy in another project, same-project redeploy allowance, and configured quota caps.
- Warning, backend build: `Microsoft.OpenApi` transitive/package warning `NU1903` remains and should be handled in a later dependency hygiene pass.

Required fixes:
- None for Phase 2.

Validation:
- `./dotnet/dotnet build backend/OneClickHost.Api/OneClickHost.Api.csproj`: PASS, 0 errors.
- `./dotnet/dotnet run --project backend/OneClickHost.Api.Tests/OneClickHost.Api.Tests.csproj`: PASS, including new quota tests.
- Local Postgres API smoke with temporary container: PASS. Verified service-level project A blocks compose deploy of project B with `409`, same-project service redeploy returns `202`, other-project service deploy returns `409`, and concurrent same-user deploys returned one `202` and one `409`.

Approved next phase:
- `Phase 3 - Stop/Delete Releases Runtime Slot`

Phase 3 execution direction:
- Implement and validate the Compose Project stop/delete flow before service-level stop/delete work.
- A project in `stopping` or `deleting` remains visible in the UI and continues to hold the user's only active-runtime slot.
- Do not remove the project from the UI, clear its runtime metadata, or allow another project to deploy until the worker has successfully removed its Compose resources and persisted the terminal cleanup state.
- The API may acknowledge the requested operation immediately, but the frontend must represent it as an in-progress operation until worker confirmation is observable through the project status.
- Required acceptance path: deploy Compose project A, request stop or delete, confirm project B is still blocked while A is cleaning up, then confirm B can deploy only after A reaches the worker-confirmed terminal state.

## Phase 2.5 Implementation And Review

Review Decision: `PASS`

Summary:
- Compose inspection now discovers known Compose files, recommends production-ready files, and explains why a local-development file cannot deploy.
- Saving or deploying a Compose configuration with a relative source bind mount, `dev` target, or development watcher returns `422 Unprocessable Entity` before a worker job is queued.
- The worker rejects all relative host bind mounts as a final safeguard, retains named data volumes, and captures container status/logs before cleanup on a failed Compose deployment.
- The dashboard requires a successful inspection before save, lets users choose discovered files, and applies detected route ports explicitly instead of preserving stale routes silently.

Validation:
- Backend build and test console: PASS.
- Frontend lint and production build: PASS.
- Local API smoke: development Compose inspect returned `200` with validation errors; saving it returned `422`. Default inspection selected `docker-compose.prod.yml`; stale frontend port `5173` returned `422`; production routes `8080` and `80` saved with `200`.
- Worker smoke: nested source bind mount was rejected; named PostgreSQL data volume was retained.

Residual risks:
- Worker `pytest` is not installed in the current container image, so the new Python tests were smoke-tested through the worker runtime rather than collected by pytest.
- Existing failed deployments need a later cleanup action; Phase 3 owns the stop/delete lifecycle and UI removal contract.

## Phase 3 Implementation And Review

Review Decision: `PASS_AUTOMATED_PENDING_USER_VALIDATION`

Summary:
- Stop and delete now return `202 Accepted`; API records intent only and no longer removes runtime routes directly.
- Projects remain visible in `stopping` and `deleting`; those states plus cleanup failures continue to reserve the user's runtime slot.
- Worker cleanup verifies containers, tunnels, routes, networks, volumes, and project-owned image tags before releasing the slot or deleting the project row.
- Stop preserves named volumes. Delete removes named volumes and project-owned Compose image tags, including the Stop-then-Delete case.
- Failed Compose deployments clean partial runtime resources before becoming inactive; incomplete cleanup uses `cleanup_failed`.
- Dashboard polls transitional projects, shows cleanup states, disables conflicting actions, and offers cleanup retry after failure.

Validation:
- Backend build and test console: PASS, including cleanup-state quota coverage.
- Frontend lint and production build: PASS.
- Worker pytest: PASS, 12 tests.
- Full local Compose E2E: PASS. Verified A remains visible and blocks B while worker is stopped; A releases the slot only after `stopped`; Stop preserves its volume; Delete remains visible and blocks B; worker deletion removes row, volume, containers, routes, networks, and image tags.

User validation gate:
- Run the Phase 1-3 manual checklist supplied by Codex.
- Do not start Phase 4 until the user reports the checklist result and Codex records the final decision.

## Phase Queue

1. `Phase 1 - Public Signup Safety`
2. `Phase 2 - Runtime Quota: 1 Active Project Per User`
3. `Phase 2.5 - Compose Deploy Safety & Clarity`
4. `Phase 3 - Stop/Delete Releases Runtime Slot`
5. `Phase 4 - Worker Resource Guardrails`
6. `Phase 5 - HTTPS Baseline`
7. `Phase 6 - Production Smoke Test Suite`
8. `Phase 7 - Observability And Admin Recovery`
9. `Phase 8 - Release Gate`

## Report Template For Antigravity

```markdown
## Antigravity Report

Status: `READY_FOR_CODEX_REVIEW`

Summary:
- <What changed and why>

Files changed:
- `<path>`: <short description>

Commands run:
- `<command>`: <pass/fail, key output>

Test output:
- <Exact relevant output or concise summary>

Known blockers:
- <None or blocker>

Questions for Codex:
- <None or question>
```

## Review Template For Codex

```markdown
## Codex Review

Review Decision: `PASS` | `CHANGES_REQUESTED` | `BLOCKED`

Summary:
- <Review summary>

Findings:
- <Severity, file, line, issue>

Required fixes:
- <Fix list or None>

Approved next phase:
- <Next phase if PASS>
```
