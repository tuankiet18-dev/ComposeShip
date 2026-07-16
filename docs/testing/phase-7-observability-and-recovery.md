# Phase 7: Observability And Admin Recovery

Status: `PASS_LOCAL_AWS_ALERT_DELIVERY_PENDING`

## Implemented

- API logs use JSON console output and every response has `X-Correlation-ID`.
  A valid caller-supplied ID is preserved; otherwise the API creates one.
- Execution-node deployment events send their deployment ID as correlation ID.
  Project event metadata automatically includes the active correlation ID.
- The worker redacts known secret environment values before persistence in build
  logs, errors, and executor event payloads.
- Host-only CLI recovery actions exist for disabling/enabling an account,
  draining/activating an execution node, and retrying failed project cleanup.
  They run as `api --admin <action> <guid>` and are not HTTP endpoints.
- Terraform provisions a dedicated SNS alert topic, opt-in email subscription,
  least-privilege `cloudwatch:PutMetricData` permissions, and CloudWatch
  alarms for low disk, backup failures, offline executor, queue age, cleanup
  failures, recent deployment failures, repeated restarting containers, API,
  database, and executor-worker health.
- `scripts/report-host-metrics.sh` collects host disk, available memory, CPU,
  Docker health/restarts, API, database and worker health. On the control
  plane it also queries queue age, cleanup failures, deployment failures in
  the preceding fifteen minutes, and stale/offline execution nodes from
  PostgreSQL. It emits only aggregate counts.
- Both EC2 bootstrap templates install a persistent systemd metrics timer that
  reports every five minutes. Backup failures emit `BackupFailure` before the
  temporary dump is removed.
- [Incident runbooks](../incident-runbooks.md) cover disk full, database
  unavailable, worker offline, Cloudflare tunnel failure, and suspected node
  compromise.

## Local Evidence

- `X-Correlation-ID: release-test-1234` was returned unchanged by `/health`.
- The account disable/enable CLI was exercised against temporary PostgreSQL;
  database state changed `false -> true -> false`.
- The API was recreated with its Data Protection volume intact; persisted key
  file count remained `1 -> 1`, so auth/cookie key material is no longer
  ephemeral across normal API container recreation.
- `METRICS_DRY_RUN=true` against the local PostgreSQL stack emitted all twelve
  aggregate metric types with healthy values, including database-backed queue,
  cleanup, failure, and executor metrics.
- Backend console tests: `18/18 PASS`; worker tests: `57 passed`; frontend
  lint/build, shell syntax checks, API Docker build, and Terraform validation:
  PASS.

## Local Verification

Run without sending metrics to AWS:

```bash
AWS_REGION=ap-southeast-1 \
ENV_FILE="$PWD/env" \
COMPOSE_FILE="$PWD/docker-compose.yml" \
METRICS_DRY_RUN=true \
./scripts/report-host-metrics.sh control-plane
```

For AWS, set `alert_email` in `infra/aws/mvp/terraform.tfvars`, apply
Terraform, and confirm the SNS subscription before relying on alarms. The
empty default is deliberate for local planning only; a release cannot pass
without a confirmed recipient.

## Required Before Exit Gate

- Apply the Terraform topology, confirm the SNS subscription, and trigger or
  safely simulate every critical CloudWatch alarm.
- Run an administrator recovery drill for `cleanup_failed` and an offline
  executor against the deployed two-node stack without direct SQL edits.
- Secret-scan actual production logs and diagnostic snapshots after a staging
  deployment.
