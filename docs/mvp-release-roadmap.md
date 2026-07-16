# MVP Release Roadmap

## Status And Product Decisions

Release target: `INVITE_ONLY_MVP`

Current release decision: `NO_GO`

Approved decisions:

- AWS topology: two nodes, one control plane and one private execution node.
- Dashboard: React/Vite assets in private S3 behind CloudFront.
- Dashboard/API HTTPS: CloudFront default domain until a domain is purchased.
- User app HTTPS: Cloudflare Quick Tunnel preview URLs during the pilot.
- Registration: invite-only with a configured total account cap.
- Primary workload flow: Compose projects.
- Runtime quota: one active project per user.

## Completed Baseline

| Phase | Outcome | Evidence |
|---|---|---|
| Phase 0 | CloudFront/S3 infrastructure code and deploy script prepared | Static review passed; AWS apply still pending |
| Phase 1 | Public signup safety baseline | Generic registration response and auth rate limiting |
| Phase 2 | Per-user quotas | One active project, caps, and advisory-lock race protection |
| Phase 2.5 | Compose deploy safety | Production-file discovery and unsafe Compose rejection |
| Phase 3 | Worker-confirmed Stop/Delete | Automated tests and user E2E validation passed |
| Phase 4A | Worker resource guardrails | Local validation passed; see `docs/testing/phase-4a-resource-guardrails.md` |

User E2E result for Phase 1-3: `20/21 PASS`. The only reported failure was an
incorrect label selector in the external test script; the project reached
`live`, and worker-confirmed cleanup passed.

## Delivery Rules

1. Implement one phase at a time.
2. Do not start the next phase until tests pass and Codex records `PASS`.
3. Do not combine security-boundary changes with unrelated UI refactors.
4. Every phase must include automated tests, manual acceptance, rollback notes,
   configuration documentation, and an update to `AGENT_HANDOFF.md`.
5. No real secret, token, AWS credential, or private URL may enter Git.
6. A failed exit gate keeps the release decision at `NO_GO`.

## Phase 3 Closure - Release Source Baseline

### Goal

Turn the validated Phase 1-3 work into a reproducible release source.

### Tasks

- Correct the E2E Docker label assertion and rerun the failed container check.
- Record Phase 3 as `PASS_USER_VALIDATED` in `AGENT_HANDOFF.md`.
- Push the current phase branch and open a pull request.
- Run the full repository validation suite on the pull request.
- Merge Phase 0-3 into `main` after review.
- Use an immutable release tag or commit SHA in Terraform `repository_ref`.

### Exit Gate

- E2E result is 21/21 or the label-only discrepancy is verified and documented.
- Remote `main` contains the reviewed Phase 0-3 commits.
- Working tree contains no accidental secrets or generated runtime files.

## Phase 4A - Worker Resource Guardrails

### Goal

Prevent one build, container, or accumulated Docker artifact from exhausting the
execution node.

### Backend Tasks

- Add configurable global active-project and queued-deployment limits.
- Return `409` for user quota conflicts and `503` for temporary platform capacity.
- Keep the per-user advisory lock and add a platform-capacity transaction lock.
- Expose safe capacity data to the dashboard without leaking other users.

### Worker Tasks

- Enforce platform CPU, memory, and PID values as hard caps; never preserve a
  larger value supplied by user Compose.
- Check free bytes and free percentage before clone/build/deploy.
- Reject new builds below the hard watermark with an actionable platform error.
- Add a periodic cleaner with a single-worker lock.
- Delete stale workspaces only when no active DB lease references them.
- Remove stopped/orphaned OneClick containers after DB reconciliation.
- Remove old OneClick-built images by label, age, and active deployment references.
- Prune build cache only under pressure and with an age threshold.
- Never run automatic `docker system prune -a --volumes`.
- Never delete user named volumes except worker-confirmed project Delete.

### Host Tasks

- Configure Docker `json-file` rotation with `max-size` and `max-file`.
- Configure minimum free-disk alarms.
- Reserve disk headroom for PostgreSQL and system operations.

### Tests

- User Compose cannot raise memory, CPU, or PID limits.
- Cleaner ignores active deployments and active workspaces.
- Stop preserves named volumes; Delete removes only project-owned volumes.
- Low disk blocks deployment before cloning/building.
- Concurrent cleaner instances do not delete the same resource twice.
- Global capacity admits only the configured number of active projects.

### Exit Gate

- Worker tests, backend tests, and a local disk-pressure simulation pass.
- Repeated fixture deploy/delete cycles do not show unbounded disk growth.
- No control-plane or unrelated Docker resource is removed.

## Phase 4B - Invite-Only And Release Reliability

### Goal

Make account admission controlled and make a fresh deployment reproducible.

### Invite Tasks

- Add hashed, one-time invite records with expiry and revocation.
- Require an invite during registration.
- Add a configured total pilot-user cap, initially 10.
- Add admin CLI commands for create, list, and revoke operations.
- Rate limit invite redemption attempts.
- Preserve non-enumerating duplicate-email behavior.

### Deployment Tasks

- Fix fresh AWS schema creation with an explicit migration step.
- Fail startup when required production configuration is missing.
- Pin base image versions and deployment source revision.
- Patch known High dependency advisories.
- Ensure the production API environment does not expose Swagger.

### CI Tasks

- Make frontend lint blocking.
- Run backend build and test console.
- Install and run all worker pytest tests.
- Build the frontend with `VITE_API_URL=/api`.
- Validate every supported Compose topology with the correct overlays.
- Run NuGet, npm, and Python dependency audits.
- Run Terraform format and validate for the release topology.

### Exit Gate

- Fresh empty PostgreSQL deployment migrates and serves authenticated APIs.
- Registration without a valid invite cannot create an account.
- CI is green with no unresolved Critical or High dependency advisory.

## Phase 5A - Two-Node Security Boundary

### Goal

Ensure user code runs only on the private execution node and cannot reach
control-plane secrets or privileged host interfaces.

### Tasks

- Remove the Docker socket and user build capability from the control plane.
- Run only dispatcher behavior on the control plane.
- Run executor behavior and user Docker workloads on the execution node.
- Separate control-plane networks from every user project network.
- Allow execution-node calls only to required private API endpoints.
- Block user containers from PostgreSQL, control-plane internal services, Docker
  socket, host namespaces, and EC2 instance metadata.
- Set IMDSv2 explicitly and prevent workload access to `169.254.169.254`.
- Enforce `no-new-privileges`, reduced capabilities, default seccomp/AppArmor,
  and no host path/device access.
- Trust forwarded headers only from configured Traefik/CloudFront proxies.
- Restrict execution-node published ports to control-plane private traffic.
- Ensure execution-node IAM permissions cannot administer the control plane.

### Tests

- A malicious fixture cannot resolve or connect to control-plane PostgreSQL.
- A user container cannot retrieve EC2 metadata credentials.
- Docker socket, privileged, host network, host PID, devices, capabilities, and
  absolute/relative bind mounts are rejected.
- Execution-node replacement can register and resume leasing safely.
- A compromised project network cannot connect to another project network.

### Exit Gate

- Network and metadata penetration tests pass.
- Control-plane EC2 has no user containers and no user-workload Docker socket.
- Execution-node loss does not corrupt control-plane database state.

## Phase 5B - HTTPS Baseline Without A Domain

### Goal

Provide HTTPS for all browser-visible MVP surfaces without buying a domain.

### Tasks

- Apply the private S3 and CloudFront dashboard distribution.
- Build the dashboard with relative `/api` requests.
- Use secure, HttpOnly cookies through CloudFront.
- Restrict the API origin to CloudFront and required admin diagnostics.
- Add security response headers suitable for the SPA and API.
- Use Cloudflare Quick Tunnel for each selected user route.
- Mark Quick Tunnel URLs as temporary preview URLs in the dashboard.
- Remove HTTP user URLs from the pilot's primary UI flow.
- Keep `sslip.io` HTTP routing only for local/infrastructure diagnostics.

### Tests

- HTTP viewer requests redirect to CloudFront HTTPS.
- Login cookies are Secure, HttpOnly, and survive SPA refresh.
- Direct unauthorized origin access is denied.
- Fixture frontend/API Quick Tunnel URLs use HTTPS and reach the correct service.
- Stop/Delete removes Quick Tunnel containers and stale URLs.

### Exit Gate

- Dashboard, API, and every displayed user route use HTTPS.
- No production auth flow requires `AUTH_COOKIE_SECURE=false`.

## Phase 6 - Data Protection And Production Smoke Suite

### Goal

Prove that the deployed AWS system can recover data and complete its primary
user journey.

### Tasks

- Add encrypted `pg_dump` backup to a private S3 bucket.
- Define daily schedule, retention, failure alert, and least-privilege IAM.
- Document and execute a restore into a clean PostgreSQL instance.
- Add readiness checks for PostgreSQL, dispatcher, execution node, Docker, and disk.
- Automate the Phase 1-3 E2E flow against staging.
- Add CloudFront SPA refresh, auth cookie, invite, Quick Tunnel, worker restart,
  stop/delete, capacity, and cleanup tests.
- Add a deployment rollback runbook pinned to the previous release tag.

### Exit Gate

- A backup is restored successfully and validated.
- Full staging smoke suite passes twice from a clean deployment.
- Rollback to the previous release is demonstrated.

## Phase 7 - Observability And Admin Recovery

### Goal

Detect resource exhaustion and recover failed runtime state without direct
database edits.

### Tasks

- Collect host disk, memory, CPU, Docker, API, DB, and worker health metrics.
- Alert on low disk, repeated container restart, offline executor, backup failure,
  queue age, cleanup failure, and elevated deployment failure rate.
- Add structured correlation IDs across API, deployment, worker, and project events.
- Add admin-only actions for retry cleanup, disable invite, disable account,
  drain execution node, and reconcile stale routes/resources.
- Redact secrets from logs and define log retention.
- Write incident runbooks for disk full, DB unavailable, worker offline,
  Cloudflare tunnel failure, and compromised execution node.

### Exit Gate

- Every Critical alert has a tested runbook.
- `cleanup_failed` and offline-node scenarios can be recovered without SQL edits.
- Secret scanning of logs and diagnostic snapshots passes.

## Phase 8 - Invite-Only Release Gate

### Goal

Make a deliberate go/no-go decision for the first real users.

### Go Criteria

- All previous phase exit gates are `PASS`.
- No open Critical or High security issue.
- No unresolved data-loss issue.
- Terraform plan is reviewed and AWS staging smoke tests pass.
- Backup/restore and rollback drills pass.
- Capacity limits and estimated AWS budget are approved.
- Terms, privacy notice, acceptable-use rules, and abuse contact exist.
- Pilot account cap is configured and public registration is disabled.

### Rollout

1. Create invites for internal testers.
2. Observe at least 48 hours with a maximum of three active projects globally.
3. Expand to at most ten invited accounts.
4. Review incidents, resource trends, failed deployments, and support questions.
5. Keep public signup disabled until a separate public-release review.

### No-Go Conditions

- User workload can reach control-plane data or instance credentials.
- Disk cleanup, backup, migration, or HTTPS tests fail.
- Execution-node failure leaves runtime slots permanently reserved without an
  admin recovery path.
- CloudFront origin can be used to bypass authentication/rate-limit assumptions.
- The deployed source revision differs from the reviewed release revision.

## Post-Pilot Direction

After the pilot is stable, evaluate:

- purchasing a domain and enabling stable wildcard HTTPS;
- email verification and password reset;
- public signup with bot and abuse controls;
- RDS for managed database recovery;
- x86 and ARM execution-node pools;
- stronger tenant isolation or per-tenant execution capacity;
- usage metering, billing, and user-facing quota dashboards.
