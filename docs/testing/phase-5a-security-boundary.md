# Phase 5A: Two-Node Security Boundary

Status: `PASS_LOCAL_AWS_PENETRATION_PENDING`

## Controls Implemented Locally

- Execution-mode Compose routes use private published ports for control-plane
  Traefik. They no longer join a Docker network shared with other projects.
- Cloudflare Quick Tunnel routes receive a per-project `oneclick-tunnel`
  network. A tunnel attaches only to that project-owned network.
- User Compose cannot declare external resources, custom network names,
  non-bridge network drivers, driver options, Docker/host bind mounts,
  privileged mode, devices, capabilities, host/shared namespace modes, or
  absolute/relative source bind mounts.
- The runner overwrites capability and privilege settings with `cap_drop: ALL`,
  `NET_BIND_SERVICE` only, and `no-new-privileges:true`; Docker default seccomp
  and AppArmor remain in effect.
- Terraform uses separate control-plane and execution-node IAM roles, restricts
  execution-node API access to control-plane port `5000`, requires IMDSv2 with
  hop limit one, and installs a Docker `DOCKER-USER` rule blocking metadata.
- Forwarded headers are accepted only from configured trusted proxy networks;
  direct callers cannot choose a client IP through `X-Forwarded-For`.
- The two-node control-plane configuration sets `Runtime:ComposeOnly=true`.
  New pilot projects are Compose projects, and legacy create/deploy service
  requests return `409` with a Compose-specific message instead of creating a
  job that the executor intentionally cannot run.

## Local Evidence

- Worker pytest: `57 passed`, including external network, namespace-sharing,
  route-network, capability, and Quick Tunnel sanitization assertions.
- API build: PASS after trusted-forwarded-header configuration change.
- Docker Compose validation: PASS for local, control-plane, and execution
  topologies.
- Terraform `init -backend=false`, `fmt -check`, and `validate`: PASS in the
  Terraform 1.9.8 container.

## Required Before Exit Gate

- Deploy to AWS staging and run live network penetration fixtures: PostgreSQL,
  EC2 metadata, Docker socket, host namespace, and cross-project connectivity
  must all fail from a user container.
- Exercise replacement of an execution node while a lease is in progress.
- Confirm host firewall persistence across execution-node reboots.
