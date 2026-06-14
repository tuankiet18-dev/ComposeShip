variable "aws_region" {
  description = "AWS region for the cost-optimized phase-one multi-node deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Name prefix used for AWS resources."
  type        = string
  default     = "oneclick-phase1"
}

variable "repository_url" {
  description = "Git repository cloned by both nodes."
  type        = string
  default     = "https://github.com/HienMinh58/oneclick-host.git"
}

variable "repository_ref" {
  description = "Git branch, tag, or commit checked out after cloning."
  type        = string
  default     = "main"
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

variable "postgres_db" {
  description = "PostgreSQL database name for the container database."
  type        = string
  default     = "oneclickhost"
}

variable "postgres_user" {
  description = "PostgreSQL username for the container database."
  type        = string
  default     = "oneclick"
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

variable "oneclick_secret_key" {
  description = "Secret encryption key for stored service environment values. Leave empty to generate one."
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
