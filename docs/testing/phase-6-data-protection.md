# Phase 6: Data Protection And Production Smoke Suite

Status: `IN_PROGRESS`

## Implemented

- Terraform creates a separate private backup S3 bucket with public access
  blocked, Bucket Owner Enforced ownership, SSE-S3 encryption, and configurable
  7–90 day retention (default 14 days).
- The control-plane IAM role can only list that bucket and read/write objects
  beneath `postgres/`; the execution-node role has no backup permission.
- `scripts/backup-postgres.sh` produces a PostgreSQL custom-format dump and
  uploads it over TLS with server-side encryption.
- `scripts/restore-postgres.sh` requires the explicit
  `--confirm-destructive-restore` acknowledgement before it can replace a
  database.
- AWS bootstrap installs a daily persistent systemd timer at `03:17 UTC`.
- The encrypted control-plane root EBS volume is retained on termination so an
  accidental instance replacement cannot silently delete the host-local
  PostgreSQL data before recovery is assessed.

## Local Restore Evidence

1. Exported the active local PostgreSQL database with `pg_dump --format=custom`.
2. Restored it with `pg_restore --clean --if-exists` into a separate temporary
   PostgreSQL instance.
3. Verified source and restored `Users` counts match: `10`.

## Required Before Exit Gate

- Apply Terraform in AWS staging and verify the timer uploads an object to the
  generated backup bucket.
- Restore a staging backup with the actual restore script into a clean target
  database, verify authenticated API access, and record the drill timestamp.
- Configure a real failure destination for the backup timer/CloudWatch alert.
- Run the complete staging smoke suite twice and demonstrate a rollback to the
  preceding immutable release revision.
