output "public_ip" {
  description = "Elastic IP attached to the OneClick-Host EC2 instance."
  value       = aws_eip.oneclick.public_ip
}

output "app_url" {
  description = "Dashboard URL served by CloudFront."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "api_url" {
  description = "Control-plane API URL through CloudFront."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}/api"
}

output "ec2_origin_url" {
  description = "Direct EC2 Traefik origin URL. Use for API-origin debugging."
  value       = "http://${local.effective_domain}"
}

output "frontend_bucket_name" {
  description = "S3 bucket that stores the built dashboard files."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for dashboard invalidations."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "effective_domain" {
  description = "Domain used by Traefik. If domain_name is empty, this uses sslip.io based on the Elastic IP."
  value       = local.effective_domain
}

output "ssh_command" {
  description = "SSH command for the Ubuntu EC2 host."
  value       = "ssh -i <path-to-private-key> ubuntu@${aws_eip.oneclick.public_ip}"
}

output "wildcard_dns_hint" {
  description = "DNS guidance for this deployment."
  value       = trimspace(var.domain_name) != "" ? "Create A records: ${var.domain_name} -> ${aws_eip.oneclick.public_ip}, *.${var.domain_name} -> ${aws_eip.oneclick.public_ip}" : "No DNS setup required. Using wildcard DNS via ${local.effective_domain}."
}

output "traefik_dashboard_hint" {
  description = "Optional dashboard URL when enable_traefik_dashboard_port is true."
  value       = var.enable_traefik_dashboard_port ? "http://${aws_eip.oneclick.public_ip}:8081/dashboard/" : "Dashboard port is disabled by default."
}
