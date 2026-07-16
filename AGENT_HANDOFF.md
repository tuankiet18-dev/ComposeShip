# Agent Handoff

This file coordinates the active implementation phase between Codex and
Antigravity. Long-lived decisions are documented in:

- `docs/architecture-two-node-mvp.md`
- `docs/mvp-release-roadmap.md`

## Rules

1. Work on one phase at a time.
2. Read the architecture and roadmap before implementation.
3. Do not start a later phase until Codex records `PASS` for the current phase.
4. Keep reports factual: files changed, commands, results, residual risks.
5. Never store secrets, credentials, tokens, private URLs, or Terraform state here.
6. Do not broaden the phase with unrelated refactors.

## Completed Baseline

| Phase | Decision |
|---|---|
| Phase 0 - CloudFront/S3 preparation | `PASS_STATIC_AWS_APPLY_PENDING` |
| Phase 1 - Signup safety | `PASS` |
| Phase 2 - Runtime quota | `PASS` |
| Phase 2.5 - Compose safety and clarity | `PASS` |
| Phase 3 - Worker-confirmed Stop/Delete | `PASS_USER_VALIDATED` |
| Phase 4A - Worker resource guardrails | `PASS_LOCAL` |
| Phase 4B - Invite-only and reliability | `PASS_LOCAL_PENDING_CI` |

Phase 1-3 user E2E result: `20/21 PASS`. The reported failure was caused by an
incorrect Docker label selector in the external test script. The deployment
reached `live`, and Stop/Delete cleanup passed.

## Product Decisions

- Release topology: two AWS EC2 nodes.
- Control plane: API, PostgreSQL, dispatcher, and CloudFront API origin.
- Execution node: executor worker, Docker Engine, and all user workloads.
- Dashboard: private S3 behind CloudFront.
- User app HTTPS before buying a domain: Cloudflare Quick Tunnel previews.
- Admission: invite-only, initially capped at 10 accounts.
- Capacity baseline: one active project per user and three globally active projects.

## Current Phase

Phase: `8 - Invite-Only Release Gate`

Status: `NO_GO_AWS_EVIDENCE_AND_OPERATOR_APPROVAL_PENDING`

Owner: `Codex`

Goal: collect release evidence, run reproducible local checks, and prevent a
release claim until AWS staging, operator approval, and external evidence pass.

## Codex Report: Phase 5–7 Partial

Status: `PARTIAL_LOCAL_AWS_EVIDENCE_REQUIRED`

- Phase 5A isolation code and Terraform boundary controls are documented in
  `docs/testing/phase-5a-security-boundary.md`; worker suite passes `57` tests.
- Phase 5B defaults pilot user routes to HTTPS Quick Tunnel and uses a
  CloudFront-only origin header plus secure auth cookies.
- Phase 6 adds private encrypted S3 backup infrastructure, least-privilege IAM,
  explicit backup/restore scripts, and local PostgreSQL restore verification.
- Phase 7 adds JSON logs, correlation IDs, host-only recovery commands, account
  disablement migration, incident runbooks, aggregate CloudWatch metrics, and
  Terraform alarms. Local metric collection and the full local test suite pass.
- Production is now Compose-only, CloudFront has browser security headers, all
  Cloudflared sidecars are digest-pinned, and immutable-SHA rollout/rollback
  documentation avoids replacing the control-plane PostgreSQL host.

Do not mark any of these phases release-ready until AWS staging tests, alerts,
backup drill, and recovery drills are recorded in `docs/release-evidence.md`.

## Codex Report: Phase 4B

Status: `PASS_LOCAL_PENDING_CI`

- Added hash-only, one-time, expiry/revocable invites, a default cap of ten
  users, generic registration responses, and IP-partitioned redemption limits.
- Added host-only `--invite create|list|revoke` commands and an explicit
  `--migrate` application mode invoked by `scripts/migrate-control-plane.sh`.
- Added migration `20260711235756_AddInviteOnlyAdmissions` and passed it on a
  fresh temporary PostgreSQL database.
- Local API verification proved valid invite redemption creates one user while
  a repeated code yields generic `202` without creating another user.
- Backend console suite: `16/16 PASS`; frontend lint/build: PASS; production
  dependency audit: zero npm vulnerabilities after the Vite lockfile update.
- CI now runs backend tests, worker pytest, NuGet/npm/Python audits, and
  Terraform validation. GitHub CI has not yet run on a pushed commit.

Residual: Phase 4B is not a release pass until the blocking CI workflow is
green. Production source/image pinning is still being completed with Phase 5.

## Phase 4A Codex Review

Review Decision: `PASS_LOCAL`

Evidence: [`docs/testing/phase-4a-resource-guardrails.md`](docs/testing/phase-4a-resource-guardrails.md).

- The full local lifecycle E2E passed `22/22`, including Docker-enforced CPU,
  memory, PID, and log rotation checks.
- Three deploy/delete cycles left no managed runtime and no storage growth.
- Backend console tests (`13`), worker pytest (`56`), frontend lint/build, and
  supported Compose config checks passed.
- The safe capacity endpoint exposes status only, not tenant metadata.

Residual risk: local validation does not replace AWS staging evidence. Data
Protection keys are currently ephemeral in local Compose and must be addressed
in the HTTPS/production configuration phase.

## Phase 4B Required Scope

- Add hashed, one-time invites with expiry and revocation.
- Require a valid invite to register and enforce a configured pilot-account cap
  of `10`; retain non-enumerating signup behavior and rate limit redemption.
- Add admin CLI commands for invite creation, listing, and revocation.
- Make fresh PostgreSQL migration explicit and fail production startup when
  required configuration is absent.
- Pin deployment source/image revisions, patch High/Critical advisories, remove
  production Swagger, and make the full CI suite blocking.

## Phase 4B Exit Gate

- Empty PostgreSQL migrates and serves authenticated APIs.
- Registration without a valid invite cannot create an account.
- CI has no unresolved Critical or High dependency advisory.

## Report Template

```markdown
## Antigravity Report

Status: `READY_FOR_CODEX_REVIEW`

Summary:
- <what changed and why>

Files changed:
- `<path>`: <description>

Commands run:
- `<command>`: <pass/fail>

Test output:
- <concise factual result>

Known blockers:
- <none or blocker>

Questions for Codex:
- <none or question>
```
