# Incident Runbooks

These runbooks are for the control-plane administrator. Run commands on the
control-plane through SSM or SSH; do not expose administrative endpoints to the
dashboard or execution-node workloads.

## Disk Full Or Cleanup Failure

1. Confirm capacity and cleanup state:

   ```bash
   df -h
   docker system df
   journalctl -u oneclick-execution-node -n 250 --no-pager
   ```

2. Do not run `docker system prune -a --volumes`.
3. If a project has `cleanup_failed`, retry its worker-confirmed deletion:

   ```bash
   docker compose -f docker-compose.control-plane.yml \
     --env-file .generated/multinode/control-plane.env \
     run --rm --no-deps api --admin retry-cleanup <project-id>
   ```

4. If safe cleanup does not recover disk, drain the executor, preserve evidence,
   replace the node, then verify leases and routes reconcile.

## Database Unavailable

1. Check the service and its persistent volume before any restart:

   ```bash
   docker compose -f docker-compose.control-plane.yml \
     --env-file .generated/multinode/control-plane.env ps
   docker compose -f docker-compose.control-plane.yml \
     --env-file .generated/multinode/control-plane.env logs --tail=200 db
   ```

2. Start the database only, then run the explicit migration job:

   ```bash
   docker compose -f docker-compose.control-plane.yml \
     --env-file .generated/multinode/control-plane.env up -d db
   ./scripts/migrate-control-plane.sh
   ```

3. If data is corrupt, restore only after recording the target and using the
   destructive acknowledgement:

   ```bash
   ./scripts/restore-postgres.sh --confirm-destructive-restore postgres/<object>.dump
   ```

## Worker Or Executor Offline

1. Inspect execution-node heartbeat and worker logs.
2. Drain an unhealthy node before replacing it:

   ```bash
   docker compose -f docker-compose.control-plane.yml \
     --env-file .generated/multinode/control-plane.env \
     run --rm --no-deps api --admin drain-node <node-id>
   ```

3. Replace the EC2 instance through the ASG. A new node registers itself;
   verify the old node has no active lease before terminating it.
4. Activate a recovered node only after Docker, disk, and network checks pass.

## Cloudflare Quick Tunnel Failure

1. Confirm the project is live and inspect the managed `cf-*` container on the
   execution node.
2. Redeploy the same Compose project. This replaces the temporary tunnel URL.
3. Tell the pilot user that preview URLs are intentionally ephemeral. Do not
   attempt to create a stable HTTP fallback during the pilot.

## Suspected Compromised Execution Node

1. Drain the node immediately; preserve CloudWatch and Docker logs.
2. Do not trust containers, images, or workspaces from that node.
3. Rotate execution registration and agent tokens, then deploy a new execution
   node from the reviewed immutable release revision.
4. Review control-plane API access logs by `X-Correlation-ID`, revoke affected
   invites/accounts if necessary, and rotate control-plane secrets if a boundary
   test suggests exposure.
