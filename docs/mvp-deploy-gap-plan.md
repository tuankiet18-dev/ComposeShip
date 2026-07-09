# MVP Deploy Gap Plan

This plan focuses on blockers before exposing the OneClick-Host MVP beyond a trusted dev environment.

## P0: Must Patch Before Public MVP

1. Validate and apply the S3/CloudFront dashboard path.
   - Run `terraform init`, `terraform fmt -recursive`, `terraform validate`, and `terraform plan` in `infra/aws/dev`.
   - Apply the stack.
   - Publish the dashboard with `scripts/deploy-frontend-cloudfront.sh`.
   - Verify `terraform output -raw app_url` loads the SPA and `/health` returns the API health payload through CloudFront.

2. Add API rate limiting and deployment abuse controls.
   - Implement ASP.NET Core rate limiting for auth, project deploy, service deploy, compose inspect, and AI diagnosis endpoints.
   - Add config keys for per-user deploy limits and request windows.
   - Return clear `429` responses with retry hints.

3. Add quota checks before queueing deployments.
   - Enforce max projects per user.
   - Enforce max services per project.
   - Enforce max queued/running deployments per user.
   - Enforce max compose routes and env vars per project.

4. Add disk and Docker resource cleanup guardrails.
   - Before starting a build, check free disk space and fail fast with a helpful platform error when below threshold.
   - Add a periodic worker cleanup for stale workspaces, old OneClick-built images, stopped containers, and old logs.
   - Keep user-owned named volumes unless project deletion explicitly requests volume removal.

5. Lock down control-plane exposure.
   - Keep PostgreSQL private to the Docker network.
   - Keep API direct host port unbound in EC2.
   - Keep the Traefik dashboard closed by default.
   - Confirm CloudFront is the primary dashboard/API entrypoint and EC2 direct HTTP is only the origin/debug path.

## P1: Should Patch Before Wider Pilot

1. Add production smoke tests.
   - CloudFront SPA route refresh.
   - Login/register cookie flow.
   - Compose fixture inspect, deploy, logs, route, stop, delete.
   - User app route via `*.sslip.io` or owned wildcard domain.

2. Improve worker failure recovery.
   - Track current executor builds accurately instead of always leasing with `current_builds=0`.
   - Add heartbeat during long Compose builds.
   - Add retry classifications for clone/build/routing/platform failures.

3. Improve routing hardening.
   - Add a managed HTTPS path for user apps or document HTTP-only MVP limits.
   - Add route health checks after Traefik writes dynamic config.
   - Add stale route sweeper for route files no longer present in the database.

4. Add database operations.
   - Document backup and restore for the PostgreSQL container volume.
   - Add an optional S3 backup script.
   - Decide when to migrate the control-plane database to RDS.

## P2: After MVP Stabilizes

1. Add service deployment support in executor mode, or hide service deployment when the selected deployment topology is multi-node Compose.
2. Add per-user usage views in the dashboard.
3. Move large logs to object storage or a separate append-only log table.
4. Add custom CloudFront aliases and ACM certificates for owned domains.
