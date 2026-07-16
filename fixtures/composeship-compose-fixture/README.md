# ComposeShip Compose Fixture

Public fixture repository for testing ComposeShip multi-node Compose deploy.

## Services

- `frontend`: static Nginx app on port `3000`; derives the API URL from the
  public host by replacing the first `app-` label with `api-`.
- `api`: FastAPI app on port `8000`; checks PostgreSQL connectivity and stores
  a tiny visit counter.
- `db`: PostgreSQL 16 internal service. It must not be exposed publicly.

## ComposeShip Compose Config

Repository:

```text
https://github.com/tuankiet18-dev/oneclick-compose-fixture
```

Branch:

```text
main
```

Compose file:

```text
docker-compose.yml
```

Routes:

| Route slug | Service | Internal port |
|---|---|---:|
| `app` | `frontend` | `3000` |
| `api` | `api` | `8000` |

Environment variables:

| Service | Key | Value | Secret |
|---|---|---|---|
| `api` | `DATABASE_URL` | `postgresql://composeship:composeship@db:5432/composeship_fixture` | yes |

Expected checks:

```bash
curl http://api-<project>.<control-plane-ip>.sslip.io/health
curl http://api-<project>.<control-plane-ip>.sslip.io/db-check
curl http://app-<project>.<control-plane-ip>.sslip.io
```
