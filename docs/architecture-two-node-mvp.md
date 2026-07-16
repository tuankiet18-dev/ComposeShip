# Two-Node MVP Architecture

## Decision

The MVP release target is a two-node AWS topology with invite-only access.
OneClickHost will not run public user workloads on the control-plane host.

The project does not currently own a domain. The dashboard and API therefore
use the default CloudFront domain, while user applications use Cloudflare Quick
Tunnel preview URLs during the pilot.

Decision status: `ACCEPTED`

## Goals

- Protect PostgreSQL, API secrets, and control-plane availability from user code.
- Keep the first AWS deployment small enough for an invite-only pilot.
- Provide HTTPS without requiring a purchased domain.
- Preserve the current Compose-first deployment workflow.
- Provide an upgrade path to a real domain and stable wildcard HTTPS later.

## Runtime Topology

```text
Browser
  |
  +--> HTTPS CloudFront distribution
         +--> private S3 bucket: React/Vite dashboard
         +--> /api/* origin: control-plane API

Control-plane EC2, public subnet
  +--> ASP.NET Core API
  +--> PostgreSQL container
  +--> dispatcher worker, no Docker socket
  +--> private API endpoint for execution-node leases/events
  +--> lightweight NAT path for the private execution node

Execution-node EC2, private subnet
  +--> executor worker with Docker socket
  +--> Docker Engine and BuildKit
  +--> isolated user Compose projects
  +--> Cloudflare Quick Tunnel sidecars for selected public routes
```

## Trust Boundaries

### Control Plane

The control plane stores user accounts, encrypted environment values, project
configuration, deployment history, invite records, and execution-node tokens.
It must never run user images or mount the Docker socket used for user workloads.

PostgreSQL is reachable only from trusted control-plane containers. The public
security group must not expose PostgreSQL or the API host port directly.

### Execution Node

The execution node is the untrusted workload boundary. A container escape must
not expose the control-plane database volume, JWT signing key, environment
encryption key, or AWS credentials with control-plane permissions.

User containers must not reach:

- the EC2 instance metadata endpoint `169.254.169.254`;
- the control-plane PostgreSQL port;
- Docker socket or Docker API;
- host paths, devices, privileged mode, or host namespaces;
- another project's private Compose network.

The executor may call only the private control-plane API endpoints required for
registration, heartbeat, leasing, deployment events, and route targets.

## Network Model

```text
Internet
  -> CloudFront HTTPS
  -> control-plane HTTP origin restricted to CloudFront/admin paths

Control-plane private network
  -> API <-> PostgreSQL
  -> dispatcher -> API/PostgreSQL

Execution private subnet
  -> executor -> private control-plane API
  -> user project network A
  -> user project network B
  -> outbound GitHub, image registries, package registries, Cloudflare
```

Each Compose project receives a project-owned Docker network. Only services
selected as routes may join the network required by their Quick Tunnel sidecar.
No shared Docker network may contain both control-plane services and user apps.

## HTTPS Without A Domain

### Dashboard And API

- CloudFront's default `*.cloudfront.net` hostname provides viewer HTTPS.
- S3 remains private behind Origin Access Control.
- Browser API requests use relative `/api` URLs and secure, HttpOnly cookies.
- The EC2 origin must require a CloudFront-only secret header or equivalent
  origin restriction before the pilot.

### User Applications

- The pilot uses `cloudflare_quick` exposure.
- Each selected HTTP service receives a temporary
  `https://*.trycloudflare.com` URL.
- URLs may change after stop, restart, redeploy, or tunnel failure.
- The UI must describe these as preview URLs, not stable production domains.

Traefik plus `sslip.io` HTTP routing remains useful for local and infrastructure
testing, but it is not the public pilot's HTTPS contract.

## Invite-Only Access

Registration requires a one-time invite code. Invite records must contain only
a cryptographic hash, expiry, status, redemption timestamp, and optional note.

MVP behavior:

- an invite can be used once;
- expired, revoked, or redeemed invites cannot create an account;
- registration keeps a generic response for duplicate emails;
- invite attempts are rate limited;
- total registered users are capped by configuration;
- invite creation and revocation are admin-only operations;
- public signup without an invite is disabled.

Email verification, self-service password reset, and public signup are deferred
until after the invite-only pilot.

## Initial Capacity Policy

Start conservatively and adjust only after observing real workloads:

| Limit | Initial value |
|---|---:|
| Active project per user | 1 |
| Projects stored per user | 3 |
| Services per Compose project | 5 |
| Concurrent builds per execution node | 1 |
| Globally active projects | 3 |
| Memory per user container | 256 MiB hard cap |
| CPU per user container | 0.5 CPU hard cap |
| PIDs per user container | 256 hard cap |
| Pilot accounts | 10 |

Global capacity is independent of per-user quota. The API must reject a deploy
with a clear retryable capacity error when the execution node is full.

## Data And Recovery

- PostgreSQL is backed up with `pg_dump`, encrypted, and uploaded to private S3.
- Backup retention and restore drills are required before pilot approval.
- Named volumes on the execution node are not a database backup.
- Stop preserves project volumes; Delete removes project-owned volumes only
  after worker-confirmed cleanup.
- Terraform state and generated secrets must remain private and encrypted.

## Deferred Architecture

The following are intentionally outside the first pilot:

- Kubernetes or ECS orchestration;
- RDS migration;
- multi-region deployment;
- per-user custom domains;
- stable wildcard app domains;
- billing and paid quota tiers;
- strong VM-level isolation per tenant.

## Release Constraint

This architecture is approved as a target, not yet approved as deployed. The
release remains `NO-GO` until every blocking phase in
[`mvp-release-roadmap.md`](mvp-release-roadmap.md) passes its exit gate.
