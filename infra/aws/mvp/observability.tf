resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-alerts"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-alerts"
  })
}

resource "aws_sns_topic_subscription" "alert_email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alert_actions = var.alert_email == "" ? [] : [aws_sns_topic.alerts.arn]
}

data "aws_iam_policy_document" "host_metrics" {
  statement {
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["OneClickHost"]
    }
  }
}

resource "aws_iam_role_policy" "control_plane_metrics" {
  name   = "${var.project_name}-metrics"
  role   = aws_iam_role.control_plane.id
  policy = data.aws_iam_policy_document.host_metrics.json
}

resource "aws_iam_role_policy" "execution_node_metrics" {
  name   = "${var.project_name}-metrics"
  role   = aws_iam_role.execution_node.id
  policy = data.aws_iam_policy_document.host_metrics.json
}

resource "aws_cloudwatch_metric_alarm" "control_plane_low_disk" {
  alarm_name          = "${var.project_name}-control-plane-low-disk"
  alarm_description   = "Control-plane disk free percentage is below the safe watermark."
  namespace           = "OneClickHost"
  metric_name         = "DiskFreePercent"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 15
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "execution_node_low_disk" {
  alarm_name          = "${var.project_name}-execution-node-low-disk"
  alarm_description   = "Execution node disk free percentage is below the safe watermark."
  namespace           = "OneClickHost"
  metric_name         = "DiskFreePercent"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 15
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "execution-node"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  alarm_name          = "${var.project_name}-backup-failure"
  alarm_description   = "A scheduled PostgreSQL backup failed."
  namespace           = "OneClickHost"
  metric_name         = "BackupFailure"
  statistic           = "Maximum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "execution_node_offline" {
  alarm_name          = "${var.project_name}-execution-node-offline"
  alarm_description   = "No active execution node is available to process Compose deployments."
  namespace           = "OneClickHost"
  metric_name         = "OfflineExecutionNodes"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_name          = "${var.project_name}-queue-age"
  alarm_description   = "A deployment has remained queued for more than ten minutes."
  namespace           = "OneClickHost"
  metric_name         = "QueueAgeSeconds"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 600
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "cleanup_failures" {
  alarm_name          = "${var.project_name}-cleanup-failures"
  alarm_description   = "One or more projects require administrator cleanup recovery."
  namespace           = "OneClickHost"
  metric_name         = "CleanupFailures"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "deployment_failure_rate" {
  alarm_name          = "${var.project_name}-deployment-failures"
  alarm_description   = "Three or more deployments failed during the most recent fifteen-minute window."
  namespace           = "OneClickHost"
  metric_name         = "RecentDeploymentFailures"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "execution_node_restarts" {
  alarm_name          = "${var.project_name}-execution-node-restarts"
  alarm_description   = "Three or more execution-node containers are restarting."
  namespace           = "OneClickHost"
  metric_name         = "RestartingContainers"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "execution-node"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "control_plane_api_unhealthy" {
  alarm_name          = "${var.project_name}-control-plane-api-unhealthy"
  alarm_description   = "The control-plane API health endpoint is unavailable."
  namespace           = "OneClickHost"
  metric_name         = "ApiHealthy"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "control_plane_database_unhealthy" {
  alarm_name          = "${var.project_name}-control-plane-database-unhealthy"
  alarm_description   = "The control-plane PostgreSQL health check is unavailable."
  namespace           = "OneClickHost"
  metric_name         = "DatabaseHealthy"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "control-plane"
  }
  alarm_actions = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "execution_node_worker_unhealthy" {
  alarm_name          = "${var.project_name}-execution-node-worker-unhealthy"
  alarm_description   = "The execution-node worker is not running."
  namespace           = "OneClickHost"
  metric_name         = "WorkerHealthy"
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "LessThanOrEqualToThreshold"
  treat_missing_data  = "breaching"
  dimensions = {
    Role = "execution-node"
  }
  alarm_actions = local.alert_actions
}
