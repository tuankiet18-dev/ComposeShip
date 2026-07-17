variable "aws_region" {
  description = "AWS region for the cost-optimized Two-Node MVP deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Name prefix used for AWS resources."
  type        = string
  default     = "composeship-mvp"
}

variable "repository_url" {
  description = "Git repository cloned by both nodes."
  type        = string
  default     = "https://github.com/tuankiet18-dev/ComposeShip.git"
}

variable "repository_ref" {
  description = "Reviewed immutable 40-character Git commit SHA checked out on both nodes."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-fA-F]{40}$", var.repository_ref))
    error_message = "repository_ref must be the reviewed 40-character Git commit SHA; branches and mutable tags are not release inputs."
  }
}

variable "key_name" {
  description = "Existing EC2 key pair name used for SSH."
  type        = string
}

variable "admin_cidr_blocks" {
  description = "CIDR ranges allowed to SSH to the control-plane instance."
  type        = list(string)
}

variable "control_plane_instance_type" {
  description = "Smallest practical control-plane size. t4g.small keeps cost low while leaving 2 GiB RAM for API/frontend/Postgres/Traefik."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = can(regex("^t4g\\.", var.control_plane_instance_type))
    error_message = "This cost-optimized stack uses the Ubuntu arm64 AMI; choose a t4g.* instance type."
  }
}

variable "execution_node_instance_type" {
  description = "Smallest practical execution-node size. Increase to t4g.medium if Docker builds run out of memory."
  type        = string
  default     = "t4g.small"

  validation {
    condition     = can(regex("^t4g\\.", var.execution_node_instance_type))
    error_message = "This cost-optimized stack uses the Ubuntu arm64 AMI; choose a t4g.* instance type."
  }
}

variable "execution_node_min_size" {
  description = "Minimum number of private execution-node instances in the Auto Scaling Group."
  type        = number
  default     = 1
}

variable "execution_node_desired_capacity" {
  description = "Desired number of private execution-node instances in the Auto Scaling Group."
  type        = number
  default     = 1
}

variable "execution_node_max_size" {
  description = "Maximum number of private execution-node instances in the Auto Scaling Group."
  type        = number
  default     = 2
}

variable "control_plane_root_volume_size_gb" {
  description = "Root EBS volume size for the control-plane node."
  type        = number
  default     = 20
}

variable "execution_node_root_volume_size_gb" {
  description = "Root EBS volume size for user app images, build cache, and volumes."
  type        = number
  default     = 40
}

variable "execution_node_swap_size_mib" {
  description = "Swap file size for the execution node. Set to 0 to disable swap."
  type        = number
  default     = 2048

  validation {
    condition     = var.execution_node_swap_size_mib >= 0 && var.execution_node_swap_size_mib <= 8192
    error_message = "execution_node_swap_size_mib must be between 0 and 8192 MiB."
  }
}

variable "postgres_db" {
  description = "PostgreSQL database name for the container database."
  type        = string
  default     = "composeship"
}

variable "postgres_user" {
  description = "PostgreSQL username for the container database."
  type        = string
  default     = "composeship"
}

variable "postgres_password" {
  description = "PostgreSQL password. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "composeship_secret_key" {
  description = "Secret encryption key for stored service environment values. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "invite_code_pepper" {
  description = "HMAC pepper used to hash invite codes. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "execution_node_registration_token" {
  description = "Registration token shared between control-plane and execution-node. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "execution_node_token" {
  description = "Agent token used by execution-node after registration. Leave empty to generate one."
  type        = string
  default     = ""
  sensitive   = true
}

variable "worker_build_timeout" {
  description = "Maximum seconds allowed for one Docker build."
  type        = number
  default     = 900
}

variable "max_concurrent_builds" {
  description = "Maximum concurrent builds on the execution-node."
  type        = number
  default     = 1
}

variable "container_memory_limit" {
  description = "Default per-user-container memory limit."
  type        = string
  default     = "256m"
}

variable "container_cpu_limit" {
  description = "Default per-user-container CPU limit."
  type        = string
  default     = "0.5"
}

variable "container_pids_limit" {
  description = "Default per-user-container PIDs limit."
  type        = number
  default     = 256
}

variable "cloudfront_price_class" {
  description = "CloudFront edge price class for the dashboard distribution."
  type        = string
  default     = "PriceClass_100"
}

variable "backup_retention_days" {
  description = "Days to retain encrypted PostgreSQL backup objects in the private S3 bucket."
  type        = number
  default     = 14

  validation {
    condition     = var.backup_retention_days >= 7 && var.backup_retention_days <= 90
    error_message = "backup_retention_days must be between 7 and 90 days for the MVP."
  }
}

variable "alert_email" {
  description = "Email address subscribed to critical MVP alerts. Terraform will create a confirmation subscription when set."
  type        = string
  default     = ""
}
