output "control_plane_public_ip" {
  description = "Only public IPv4 used by the MVP topology."
  value       = aws_eip.control_plane.public_ip
}

output "control_plane_private_ip" {
  description = "Private API/NAT IP for execution-node traffic."
  value       = aws_network_interface.control_plane.private_ip
}

output "execution_node_autoscaling_group_name" {
  description = "Auto Scaling Group that owns private execution-node instances."
  value       = aws_autoscaling_group.execution_nodes.name
}

output "origin_url" {
  description = "CloudFront HTTP origin hostname. Direct traffic is blocked by the control-plane security group."
  value       = "http://${local.domain_name}"
}

output "app_url" {
  description = "Dashboard URL served by CloudFront."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "api_url" {
  description = "Control-plane API URL through CloudFront."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}/api"
}

output "frontend_bucket_name" {
  description = "Private S3 bucket containing the dashboard build."
  value       = aws_s3_bucket.frontend.bucket
}

output "backup_bucket_name" {
  description = "Private, encrypted S3 bucket holding PostgreSQL backup objects."
  value       = aws_s3_bucket.backups.bucket
}

output "alerts_topic_arn" {
  description = "SNS topic used by disk and backup alarms."
  value       = aws_sns_topic.alerts.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id used for dashboard invalidations."
  value       = aws_cloudfront_distribution.frontend.id
}

output "effective_domain" {
  description = "Base domain used by public app routes."
  value       = local.domain_name
}

output "control_plane_ssh_command" {
  description = "SSH command for the public control-plane node."
  value       = "ssh -i <path-to-private-key> ubuntu@${aws_eip.control_plane.public_ip}"
}

output "execution_node_ssh_command" {
  description = "SSH pattern to reach a private execution-node through the control-plane bastion. Discover the node private IP from the ASG first."
  value       = "ssh -i <path-to-private-key> -J ubuntu@${aws_eip.control_plane.public_ip} ubuntu@<execution-node-private-ip>"
}

output "fixture_repo" {
  description = "Public Compose fixture repo for acceptance testing."
  value       = "https://github.com/tuankiet18-dev/oneclick-compose-fixture"
}

output "cost_note" {
  description = "Cost-oriented shape of this stack."
  value       = "No NAT Gateway, no ALB, no RDS, one public IPv4. Control-plane acts as a small NAT instance for the private execution-node."
}
