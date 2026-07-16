#!/usr/bin/env bash
set -euo pipefail

role="${1:?Usage: $0 control-plane|execution-node}"
if [[ "$role" != "control-plane" && "$role" != "execution-node" ]]; then
  echo "Role must be control-plane or execution-node." >&2
  exit 64
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.generated/multinode/${role}.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing metrics environment file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${AWS_REGION:?AWS_REGION is required}"
disk_target="${DOCKER_ROOT_DIR:-/var/lib/docker}"
disk_percent="$(df -P "$disk_target" | awk 'NR == 2 {gsub(/%/, "", $5); print 100 - $5}')"
if [[ ! "$disk_percent" =~ ^[0-9]+$ ]]; then
  echo "Unable to determine available disk percentage for $disk_target." >&2
  exit 1
fi
read -r mem_total mem_available < <(awk '/MemTotal:/ {total=$2} /MemAvailable:/ {available=$2} END {print total, available}' /proc/meminfo)
memory_percent=$((mem_available * 100 / mem_total))

read -r cpu_total_before cpu_idle_before < <(awk '/^cpu / {total=0; for (i = 2; i <= NF; i++) total += $i; print total, $5 + $6}' /proc/stat)
sleep 1
read -r cpu_total_after cpu_idle_after < <(awk '/^cpu / {total=0; for (i = 2; i <= NF; i++) total += $i; print total, $5 + $6}' /proc/stat)
cpu_total_delta=$((cpu_total_after - cpu_total_before))
cpu_idle_delta=$((cpu_idle_after - cpu_idle_before))
cpu_percent=0
if ((cpu_total_delta > 0)); then
  cpu_percent=$(((cpu_total_delta - cpu_idle_delta) * 100 / cpu_total_delta))
fi

docker_healthy=0
if docker info >/dev/null 2>&1; then docker_healthy=1; fi
restarting_containers=0
if ((docker_healthy)); then
  restarting_containers="$(docker ps --filter status=restarting --quiet | wc -l | tr -d ' ')"
fi

db_healthy=1
worker_healthy=1
api_healthy=1
queue_age_seconds=0
cleanup_failures=0
recent_deployment_failures=0
offline_execution_nodes=0
if [[ "$role" == "control-plane" ]]; then
  compose_file="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.control-plane.yml}"
  if ! docker compose -f "$compose_file" --env-file "$ENV_FILE" exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then db_healthy=0; fi
  if ! docker compose -f "$compose_file" --env-file "$ENV_FILE" ps --status running worker | grep -q worker; then worker_healthy=0; fi
  if ! curl --fail --silent --show-error --max-time 5 http://127.0.0.1:5000/health >/dev/null; then api_healthy=0; fi

  if ((db_healthy)); then
    db_metrics="$(docker compose -f "$compose_file" --env-file "$ENV_FILE" exec -T db \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c '
WITH queued AS (
  SELECT "CreatedAt" FROM "ProjectDeployments" WHERE "Status" = '\''queued'\''
  UNION ALL
  SELECT "CreatedAt" FROM "Deployments" WHERE "Status" = '\''queued'\''
), failures AS (
  SELECT "CompletedAt" FROM "ProjectDeployments" WHERE "Status" = '\''failed'\''
  UNION ALL
  SELECT "CompletedAt" FROM "Deployments" WHERE "Status" = '\''failed'\''
)
SELECT
  COALESCE(EXTRACT(EPOCH FROM NOW() - MIN("CreatedAt"))::bigint, 0),
  (SELECT COUNT(*) FROM "Projects" WHERE "Status" IN ('\''cleanup_failed'\'', '\''deleting_failed'\'')),
  (SELECT COUNT(*) FROM failures WHERE "CompletedAt" >= NOW() - INTERVAL '\''15 minutes'\''),
  (SELECT COUNT(*) FROM "ExecutionNodes" WHERE "Status" = '\''offline'\'' OR "LastHeartbeatAt" IS NULL OR "LastHeartbeatAt" < NOW() - INTERVAL '\''2 minutes'\'')
FROM queued;')" || db_metrics="0|0|0|0"
    IFS='|' read -r queue_age_seconds cleanup_failures recent_deployment_failures offline_execution_nodes <<<"$db_metrics"
  fi
else
  compose_file="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.execution.yml}"
  if ! docker compose -p oneclick-execution -f "$compose_file" --env-file "$ENV_FILE" ps --status running worker | grep -q worker; then worker_healthy=0; fi
fi

metric_data="[
  {\"MetricName\":\"DiskFreePercent\",\"Value\":$disk_percent,\"Unit\":\"Percent\",\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"MemoryAvailablePercent\",\"Value\":$memory_percent,\"Unit\":\"Percent\",\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"CpuUtilizationPercent\",\"Value\":$cpu_percent,\"Unit\":\"Percent\",\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"DockerHealthy\",\"Value\":$docker_healthy,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"RestartingContainers\",\"Value\":$restarting_containers,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"ApiHealthy\",\"Value\":$api_healthy,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"DatabaseHealthy\",\"Value\":$db_healthy,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"WorkerHealthy\",\"Value\":$worker_healthy,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"QueueAgeSeconds\",\"Value\":$queue_age_seconds,\"Unit\":\"Seconds\",\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"CleanupFailures\",\"Value\":$cleanup_failures,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"RecentDeploymentFailures\",\"Value\":$recent_deployment_failures,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]},
  {\"MetricName\":\"OfflineExecutionNodes\",\"Value\":$offline_execution_nodes,\"Dimensions\":[{\"Name\":\"Role\",\"Value\":\"$role\"}]}
]"

if [[ "${METRICS_DRY_RUN:-false}" == "true" ]]; then
  printf '%s\n' "$metric_data"
  exit 0
fi

aws cloudwatch put-metric-data --region "$AWS_REGION" --namespace OneClickHost --metric-data "$metric_data" --no-cli-pager
