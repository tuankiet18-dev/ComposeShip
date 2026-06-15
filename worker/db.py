import psycopg2
import psycopg2.extras
import uuid
from config import DATABASE_URL
from secret_utils import decrypt_secret

MAX_ERROR_MESSAGE_LENGTH = 2000


def _truncate_error_message(value):
    if value is None:
        return None
    value = str(value)
    if len(value) <= MAX_ERROR_MESSAGE_LENGTH:
        return value
    return value[: MAX_ERROR_MESSAGE_LENGTH - 15] + "... [truncated]"


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
                   s."ServiceType",
                   s."ExposureProvider",
                   s."NetworkAliases",
                   p."Id" as "ProjectId",
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


def fetch_queued_project_deployment(conn):
    """Atomically pick up the next queued Compose project deployment."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT d."Id", d."ProjectId", d."Version",
                   p."Name" as "ProjectName",
                   p."RepoUrl", p."Branch", p."Subfolder",
                   p."ComposeFile", p."ComposeProjectName",
                   p."ComposeRoutesJson", p."ComposeEnvJson",
                   p."ComposePostStartCommands"
            FROM "ProjectDeployments" d
            JOIN "Projects" p ON d."ProjectId" = p."Id"
            WHERE d."Status" = 'queued'
              AND p."DeploymentMode" = 'compose'
            ORDER BY d."CreatedAt" ASC
            LIMIT 1
            FOR UPDATE OF d SKIP LOCKED
        """)
        row = cur.fetchone()
        if row:
            cur.execute("""
                UPDATE "ProjectDeployments"
                SET "Status" = 'cloning', "StartedAt" = NOW()
                WHERE "Id" = %s
            """, (row["Id"],))
            cur.execute("""
                UPDATE "Projects"
                SET "Status" = 'deploying', "UpdatedAt" = NOW()
                WHERE "Id" = %s
            """, (row["ProjectId"],))

    conn.commit()
    return row


def update_deployment_status(conn, deployment_id, status, **kwargs):
    """Update deployment status and optional fields."""
    sets = ['"Status" = %s']
    values = [status]

    if "error_message" in kwargs:
        sets.append('"ErrorMessage" = %s')
        values.append(_truncate_error_message(kwargs["error_message"]))

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


def supersede_previous_project_deployments(conn, project_id: str, current_deployment_id: str):
    """Mark previous live Compose deployments of a project as superseded."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE "ProjectDeployments"
            SET "Status" = 'superseded'
            WHERE "ProjectId" = %s
              AND "Id" != %s
              AND "Status" = 'live'
        """, (project_id, current_deployment_id))
    conn.commit()


def mark_live_deployments_stopped(conn, service_id: str):
    """Mark all live deployments for a service as stopped."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE "Deployments"
            SET "Status" = 'stopped', "CompletedAt" = NOW()
            WHERE "ServiceId" = %s
              AND "Status" = 'live'
        """, (service_id,))
    conn.commit()


def mark_live_project_deployments_stopped(conn, project_id: str):
    """Mark all live deployments for a project as stopped."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE "ProjectDeployments"
            SET "Status" = 'stopped', "CompletedAt" = NOW()
            WHERE "ProjectId" = %s
              AND "Status" = 'live'
        """, (project_id,))
    conn.commit()


def save_deployment_diagnostic_snapshot(conn, deployment_id: str, snapshot: dict):
    """Insert or replace the diagnostic snapshot for a failed deployment."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO "DeploymentDiagnosticSnapshots" (
                "Id",
                "DeploymentId",
                "FailureStep",
                "DetectedStack",
                "ErrorSummary",
                "RelevantLogExcerpt",
                "RepositoryTree",
                "SelectedFiles",
                "CreatedAt"
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT ("DeploymentId") DO UPDATE SET
                "FailureStep" = EXCLUDED."FailureStep",
                "DetectedStack" = EXCLUDED."DetectedStack",
                "ErrorSummary" = EXCLUDED."ErrorSummary",
                "RelevantLogExcerpt" = EXCLUDED."RelevantLogExcerpt",
                "RepositoryTree" = EXCLUDED."RepositoryTree",
                "SelectedFiles" = EXCLUDED."SelectedFiles",
                "CreatedAt" = EXCLUDED."CreatedAt"
        """, (
            uuid.uuid4(),
            deployment_id,
            snapshot.get("failure_step") or "unknown",
            snapshot.get("detected_stack"),
            snapshot.get("error_summary"),
            snapshot.get("relevant_log_excerpt"),
            psycopg2.extras.Json(snapshot.get("repository_tree") or []),
            psycopg2.extras.Json(snapshot.get("selected_files") or {}),
        ))
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
    if status in ("failed", "stopped"):
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
        return {row["Key"]: decrypt_secret(row["Value"]) for row in cur.fetchall()}


def fetch_live_backend_url(conn, project_id):
    """Return a live backend URL for a project, if one exists."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT "LiveUrl"
            FROM "Services"
            WHERE "ProjectId" = %s
              AND "ServiceType" = 'backend'
              AND "LiveUrl" IS NOT NULL
            ORDER BY "UpdatedAt" DESC
            LIMIT 1
        """, (project_id,))
        row = cur.fetchone()
    conn.commit()
    return row["LiveUrl"] if row else None


def update_project_deployment_status(conn, deployment_id, status, **kwargs):
    """Update project-level deployment status and optional fields."""
    sets = ['"Status" = %s']
    values = [status]

    if "error_message" in kwargs:
        sets.append('"ErrorMessage" = %s')
        values.append(_truncate_error_message(kwargs["error_message"]))

    if "build_logs" in kwargs:
        sets.append('"BuildLogs" = %s')
        values.append(kwargs["build_logs"])

    if "public_urls_json" in kwargs:
        sets.append('"PublicUrlsJson" = %s')
        values.append(kwargs["public_urls_json"])

    if "compose_project_name" in kwargs:
        sets.append('"ComposeProjectName" = %s')
        values.append(kwargs["compose_project_name"])

    if status in ("live", "failed", "stopped"):
        sets.append('"CompletedAt" = NOW()')

    values.append(deployment_id)

    with conn.cursor() as cur:
        cur.execute(
            f'UPDATE "ProjectDeployments" SET {", ".join(sets)} WHERE "Id" = %s',
            values
        )
    conn.commit()


def update_project_status(conn, project_id, status, **kwargs):
    """Update project status and optional fields."""
    sets = ['"Status" = %s', '"UpdatedAt" = NOW()']
    values = [status]

    if "compose_live_urls_json" in kwargs:
        sets.append('"ComposeLiveUrlsJson" = %s')
        values.append(kwargs["compose_live_urls_json"])

    values.append(project_id)

    with conn.cursor() as cur:
        cur.execute(
            f'UPDATE "Projects" SET {", ".join(sets)} WHERE "Id" = %s',
            values
        )
    conn.commit()


def fetch_deleting_services(conn):
    """
    BUG #8 SUPPORT: Fetch services marked as 'deleting' so the Worker
    can stop their Docker containers and remove Traefik routing files
    before the DB record is permanently deleted.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s."Id", s."ContainerId", s."Name" as "ServiceName",
                   p."Name" as "ProjectName",
                   ARRAY_REMOVE(ARRAY_AGG(DISTINCT d."ImageTag"), NULL) as "ImageTags"
            FROM "Services" s
            JOIN "Projects" p ON s."ProjectId" = p."Id"
            LEFT JOIN "Deployments" d ON d."ServiceId" = s."Id"
            WHERE s."Status" = 'deleting'
            GROUP BY s."Id", s."ContainerId", s."Name", p."Name"
        """)
        rows = cur.fetchall()
    conn.commit()
    return rows


def fetch_stopping_services(conn):
    """Fetch services marked as 'stopping' so the Worker can stop containers."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT s."Id", s."ContainerId", s."Name" as "ServiceName",
                   p."Name" as "ProjectName"
            FROM "Services" s
            JOIN "Projects" p ON s."ProjectId" = p."Id"
            WHERE s."Status" = 'stopping'
        """)
        rows = cur.fetchall()
    conn.commit()
    return rows


def fetch_stopping_projects(conn):
    """Fetch Compose projects marked as stopping."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT "Id", "Name" as "ProjectName", "ComposeProjectName",
                   "ComposeDeleteVolumesOnDelete"
            FROM "Projects"
            WHERE "Status" = 'stopping'
              AND "DeploymentMode" = 'compose'
        """)
        rows = cur.fetchall()
    conn.commit()
    return rows


def fetch_deleting_compose_projects(conn):
    """Fetch Compose projects marked as deleting for stack cleanup."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT "Id", "Name" as "ProjectName", "ComposeProjectName",
                   "ComposeDeleteVolumesOnDelete"
            FROM "Projects"
            WHERE "Status" = 'deleting'
              AND "DeploymentMode" = 'compose'
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


def delete_empty_deleting_projects(conn):
    """Delete project rows after all child services have been cleaned up."""
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM "Projects" p
            WHERE p."Status" = 'deleting'
              AND p."DeploymentMode" != 'compose'
              AND NOT EXISTS (
                  SELECT 1 FROM "Services" s WHERE s."ProjectId" = p."Id"
              )
        """)
        deleted_count = cur.rowcount
    conn.commit()
    return deleted_count


def permanently_delete_project(conn, project_id):
    """Permanently delete a project row after worker cleanup."""
    with conn.cursor() as cur:
        cur.execute('DELETE FROM "Projects" WHERE "Id" = %s', (project_id,))
    conn.commit()
