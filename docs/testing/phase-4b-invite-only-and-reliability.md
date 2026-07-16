# Phase 4B: Invite-Only And Release Reliability

Status: `PASS_LOCAL_PENDING_CI`

Date: 2026-07-12

## Admission Controls

- Registration requires a 40-hex-character invite code by default.
- Only an HMAC-SHA256 hash is stored in PostgreSQL. `INVITE_CODE_PEPPER` is a
  production secret and is never returned through an API.
- An invite is one-time, expires, can be revoked before redemption, and records
  the user that redeemed it.
- Registration is serialized with a PostgreSQL transaction-scoped advisory lock
  so concurrent requests cannot redeem the same code or exceed the global cap.
- `INVITES_MAX_ACCOUNTS` defaults to `10`. A rejected registration does not
  consume an invite.
- Duplicate email, invalid, expired, revoked, redeemed, and cap-rejected
  registrations all return the same `202` generic response after model
  validation. This retains the duplicate-email anti-enumeration contract.
- Invite redemption has an independent IP partitioned limit of five attempts
  per minute.

## Operations

Create, list, or revoke invites only from a control-plane shell. The code is
shown exactly once; use a secure out-of-band channel to give it to the pilot.

```bash
docker compose -f docker-compose.control-plane.yml \
  --env-file .generated/multinode/control-plane.env \
  run --rm --no-deps api --invite create --expires-hours 168 --note "pilot user"

docker compose -f docker-compose.control-plane.yml \
  --env-file .generated/multinode/control-plane.env \
  run --rm --no-deps api --invite list

docker compose -f docker-compose.control-plane.yml \
  --env-file .generated/multinode/control-plane.env \
  run --rm --no-deps api --invite revoke <invite-id>
```

Database migration is an explicit one-shot operation, not normal API startup:

```bash
./scripts/migrate-control-plane.sh
```

Terraform generates `INVITE_CODE_PEPPER` if it is not supplied. Its state file
therefore contains production secrets and must remain encrypted and private.

## Local Evidence

- API build: PASS.
- Backend console suite: `16/16 PASS`, including one-use, hash-only,
  expiry/revocation, and account-cap cases.
- Fresh PostgreSQL migration: PASS; `Invites` table and its unique hash/indexes
  were verified.
- API runtime verification: PASS; first valid invite created one account;
  reusing it returned generic `202` and created no second account.
- Frontend lint and production build: PASS.
- `npm audit --omit=dev --audit-level=high`: zero vulnerabilities after the
  Vite lockfile update.

## Rollback

Do not remove the migration while invite records exist. To pause new admission,
set `INVITES_REQUIRED=true` and stop issuing new codes; existing accounts keep
working. A schema rollback requires first confirming no invite has been
redeemed and is not a normal production recovery action.
