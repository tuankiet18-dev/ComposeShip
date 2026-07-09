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

Phase: `2 - Runtime Quota: 1 Active Project Per User`

Status: `READY_FOR_ANTIGRAVITY`

Owner: `Antigravity`

Goal:
Enforce the MVP rule that each self-serve user can run only one project at a time.

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

## Antigravity Report

Status: `PENDING`

Summary:
- Pending.

Files changed:
- Pending.

Commands run:
- Pending.

Test output:
- Pending.

Known blockers:
- Pending.

Questions for Codex:
- Pending.

## Codex Review

Review Decision: `PASS`

Summary:
- Phase 1 passed. Registration is non-enumerating in local E2E: first and duplicate registration both return `202 Accepted`, identical generic bodies, and no auth cookie. Login after registration works. Rate limiting uses partitioned policies, and local `X-Forwarded-For` partitioning works. Frontend and backend validation commands pass.

Findings:
- Residual risk, `backend/OneClickHost.Api/Program.cs`: forwarded headers are trusted broadly for the MVP Docker/Traefik path. This is acceptable for Phase 1 because Kestrel is not directly exposed in the EC2 compose path, but should be revisited before a hardened production release.
- Warning, backend build: `Microsoft.OpenApi` transitive/package warning `NU1903` remains and should be handled in a later dependency hygiene pass.

Required fixes:
- None for Phase 1.

Approved next phase:
- `Phase 2 - Runtime Quota: 1 Active Project Per User`

## Phase Queue

1. `Phase 1 - Public Signup Safety`
2. `Phase 2 - Runtime Quota: 1 Active Project Per User`
3. `Phase 3 - Stop/Delete Releases Runtime Slot`
4. `Phase 4 - Worker Resource Guardrails`
5. `Phase 5 - HTTPS Baseline`
6. `Phase 6 - Production Smoke Test Suite`
7. `Phase 7 - Observability And Admin Recovery`
8. `Phase 8 - Release Gate`

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
