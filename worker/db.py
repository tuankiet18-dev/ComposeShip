import psycopg2
import psycopg2.extras
from config import DATABASE_URL

# Register UUID adapter
psycopg2.extras.register_uuid()


def get_connection():
    """Create a new database connection."""
    return psycopg2.connect(DATABASE_URL)


def fetch_queued_deployment(conn):
    """
    Atomically pick up the next queued deployment.
    Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent access (future).
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT d."Id", d."ServiceId", d."Version",
                   s."RepoUrl", s."Branch", s."Subfolder", s."Name" as "ServiceName",
                   s."NetworkAliases",
                   p."Name" as "ProjectName"
            FROM "Deployments" d
            JOIN "Services" s ON d."ServiceId" = s."Id"
            JOIN "Projects" p ON s."ProjectId" = p."Id"
            WHERE d."Status" = 'queued'
            ORDER BY d."CreatedAt" ASC
            LIMIT 1
            FOR UPDATE OF d SKIP LOCKED
        """)
        row = cur.fetchone()
        if row:
            cur.execute("""
                UPDATE "Deployments"
                SET "Status" = 'cloning', "StartedAt" = NOW()
                WHERE "Id" = %s
            """, (row["Id"],))

    # ISSUE #4 FIX: Always commit after the SELECT block, even when no row is found.
    # Without this, psycopg2 leaves the connection in a pending-transaction limbo state,
    # which can cause "WARNING: there is already a transaction in progress" on next query.
    conn.commit()
    return row


def update_deployment_status(conn, deployment_id, status, **kwargs):
    """Update deployment status and optional fields."""
    sets = ['"Status" = %s']
    values = [status]

    if "error_message" in kwargs:
        sets.append('"ErrorMessage" = %s')
        values.append(kwargs["error_message"])

    if "image_tag" in kwargs:
        sets.append('"ImageTag" = %s')
        values.append(kwargs["image_tag"])

    if "build_logs" in kwargs:
        sets.append('"BuildLogs" = %s')
        values.append(kwargs["build_logs"])

    if status in ("live", "failed"):
        sets.append('"CompletedAt" = NOW()')

    values.append(deployment_id)

    with conn.cursor() as cur:
        cur.execute(
            f'UPDATE "Deployments" SET {", ".join(sets)} WHERE "Id" = %s',
            values
        )
    conn.commit()


def supersede_previous_deployments(conn, service_id: str, current_deployment_id: str):
    """
    When a new deployment goes live, mark all previous deployments of the
    same service as 'superseded'.

    Without this, the UI would show multiple deployments with status='live',
    which is misleading — only one container is actually running.

    Called by the Worker immediately after a successful deployment.
    """
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE "Deployments"
            SET "Status" = 'superseded'
            WHERE "ServiceId" = %s
              AND "Id" != %s
              AND "Status" = 'live'
        """, (service_id, current_deployment_id))
    conn.commit()


def update_service_status(conn, service_id, status, **kwargs):
    """Update service status and optional fields."""
    sets = ['"Status" = %s', '"UpdatedAt" = NOW()']
    values = [status]

    if "live_url" in kwargs:
        sets.append('"LiveUrl" = %s')
        values.append(kwargs["live_url"])

    if "container_id" in kwargs:
        sets.append('"ContainerId" = %s')
        values.append(kwargs["container_id"])

    if "detected_stack" in kwargs:
        sets.append('"DetectedStack" = %s')
        values.append(kwargs["detected_stack"])

    # BUG #2 FIX: When a deployment fails, clear LiveUrl and ContainerId.
    # Without this, the service still shows the URL and container ID from the
    # previous successful deployment, misleading the user into thinking it's live.
    if status == "failed":
        sets.append('"LiveUrl" = NULL')
        sets.append('"ContainerId" = NULL')

    values.append(service_id)

    with conn.cursor() as cur:
        cur.execute(
            f'UPDATE "Services" SET {", ".join(sets)} WHERE "Id" = %s',
            values
        )
    conn.commit()


def get_env_vars(conn, service_id):
    """Get environment variables for a service."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT "Key", "Value"
            FROM "EnvironmentVariables"
            WHERE "ServiceId" = %s
        """, (service_id,))
        return {row["Key"]: row["Value"] for row in cur.fetchall()}


def fetch_deleting_services(conn):
    """
    BUG #8 SUPPORT: Fetch services marked as 'deleting' so the Worker
    can stop their Docker containers and remove Traefik routing files
    before the DB record is permanently deleted.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s."Id", s."ContainerId", s."Name" as "ServiceName",
                   p."Name" as "ProjectName"
            FROM "Services" s
            JOIN "Projects" p ON s."ProjectId" = p."Id"
            WHERE s."Status" = 'deleting'
        """)
        rows = cur.fetchall()
    conn.commit()
    return rows


def permanently_delete_service(conn, service_id):
    """
    BUG #8 SUPPORT: Permanently remove a service DB record after the Worker
    has confirmed the container is stopped and Traefik config is removed.
    """
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "Services" WHERE "Id" = %s', (service_id,))
    conn.commit()
