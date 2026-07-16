# Invite-Only Release Evidence

Status: `NO-GO`

This is the authoritative evidence checklist for Phase 8. A row is not PASS
until it links to a dated staging run or reviewed AWS artifact.

| Gate | Current evidence | Status |
|---|---|---|
| Phase 1–4 local suite | Invite-aware lifecycle E2E `22/22`, backend `18/18`, worker `57/57`, frontend checks | Local PASS |
| Invite-only admission | [Phase 4B](testing/phase-4b-invite-only-and-reliability.md) | Local PASS, CI pending |
| Two-node isolation | [Phase 5A](testing/phase-5a-security-boundary.md) | Local PASS; production is Compose-only, AWS penetration pending |
| HTTPS/origin restriction | [Phase 5B](testing/phase-5b-https-baseline.md), Terraform validation | Local PASS; CloudFront viewer/origin test pending |
| Backup and restore | [Phase 6](testing/phase-6-data-protection.md) local restore | Pending S3 staging drill |
| Monitoring and recovery | [Phase 7](testing/phase-7-observability-and-recovery.md), host-only recovery CLI, validated Terraform alarms | Local PASS; AWS alert delivery and recovery drill pending |
| Staging smoke suite twice | No AWS environment yet | Pending |
| Rollback drill | [Immutable-SHA rollback runbook](deployment-rollback-runbook.md) | Procedure ready; AWS drill pending |
| Legal and abuse notices | [Pilot policy baseline](pilot-policies.md), public policy route, recorded registration acceptance | Operator review/contact and production publish pending |
| AWS budget/capacity approval | No reviewed monthly estimate | Pending |

## Required Release Artifacts

- Terraform plan reviewed against the immutable Git commit SHA.
- CloudFront/S3 deployment record and HTTPS viewer/origin denial evidence.
- Two independent full staging smoke-suite logs.
- Backup object, clean restore result, and rollback result.
- Reviewed alert delivery test for low disk, backup failure, offline node, queue
  age, cleanup failure, and deployment failure rate.
- Terms, privacy notice, acceptable-use policy, and abuse contact.
- Explicit approval of global active-project cap `3` and pilot account cap `10`.

## Current Local Gate

Local implementation and regression checks are complete enough to prepare an
AWS staging deployment. This is **not** a release approval: no CloudFront
viewer, SNS delivery, S3 restore, two-node penetration, or rollback drill has
been executed against AWS, and the pilot policy still needs an approved abuse
contact and publication in the invite flow.
