# Deployment And Rollback Runbook

This runbook rolls application code between reviewed immutable Git commit SHAs.
It does not replace the control-plane EC2 instance, which protects the
PostgreSQL root volume from an application rollout.

The control-plane root EBS volume is encrypted and retained on termination as
a defense in depth measure. It can incur cost after a deliberate teardown;
delete it only after a verified backup/restore and explicit operator approval.

## Preconditions

- A backup object is present and its timestamp is recorded.
- The target SHA passed CI and is available in the configured repository.
- The target SHA is the known previous release for rollback, or the reviewed
  release candidate for rollout.
- The current deployment SHA and CloudFront distribution ID are recorded in
  the release evidence.

## Control-Plane Rollout Or Rollback

From a trusted administrator workstation:

```bash
./scripts/rollout-control-plane.sh \
  --host "$(terraform -chdir=infra/aws/mvp output -raw control_plane_public_ip)" \
  --identity /path/to/key.pem \
  --ref <reviewed-40-character-sha>
```

The script builds application containers, runs the explicit migration command,
restarts API/dispatcher/frontend/Traefik without recreating PostgreSQL, then
checks `/health`. If a migration is not backward compatible, stop and restore
only according to the data-recovery runbook; never improvise a schema rollback.

## Execution-Node Rollout Or Rollback

1. Set `repository_ref` to the same reviewed SHA in `terraform.tfvars`.
2. Apply Terraform so the launch template contains that SHA.
3. Drain the execution node with the host-only admin command.
4. Start an ASG instance refresh after no build is active:

   ```bash
   aws autoscaling start-instance-refresh \
     --auto-scaling-group-name "$(terraform -chdir=infra/aws/mvp output -raw execution_node_autoscaling_group_name)" \
     --preferences MinHealthyPercentage=0,InstanceWarmup=300
   ```

5. Wait for the new executor to register, confirm heartbeats and a fixture
   deployment, then terminate no additional instances manually.

For rollback, repeat the same sequence with the previous reviewed SHA. This is
expected to cause a brief deployment scheduling pause in the one-node executor
baseline; do not rollout while a pilot workload is being built.

## CloudFront Dashboard

Deploy the frontend built from the same SHA and invalidate CloudFront only
after the control plane health check succeeds:

```bash
VITE_API_URL=/api ./scripts/deploy-frontend-cloudfront.sh
```

## Evidence

Record the before/after SHA, backup object, migration result, health result,
executor refresh result, and a smoke deployment in
[`release-evidence.md`](release-evidence.md). A rollback is not demonstrated
until the previous SHA has served the smoke test successfully.
