variable "aws_region" {
  description = "AWS region for the dev/test EC2 host."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Name prefix used for AWS resources."
  type        = string
  default     = "oneclick-host"
}

variable "domain_name" {
  description = "Optional root domain that points to this EC2 instance. Leave empty to use <public-ip>.sslip.io."
  type        = string
  default     = ""
}

variable "repository_url" {
  description = "Git repository cloned by cloud-init onto the EC2 host."
  type        = string
  default     = "https://github.com/HienMinh58/oneclick-host.git"
}

variable "repository_ref" {
  description = "Git branch, tag, or commit checked out after cloning."
  type        = string
  default     = "main"
}

variable "instance_type" {
  description = "EC2 instance type. t3.medium is the default MVP size."
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "Existing EC2 key pair name used for SSH."
  type        = string
}

variable "admin_cidr_blocks" {
  description = "CIDR ranges allowed to SSH to the instance and reach the optional Traefik dashboard port."
  type        = list(string)
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB. Docker builds and images need more space than a default tiny disk."
  type        = number
  default     = 60
}

variable "enable_traefik_dashboard_port" {
  description = "Whether to open TCP 8081 to admin_cidr_blocks for the Traefik dashboard."
  type        = bool
  default     = false
}

variable "postgres_db" {
  description = "PostgreSQL database name for the EC2 container database."
  type        = string
  default     = "oneclickhost"
}

variable "postgres_user" {
  description = "PostgreSQL username for the EC2 container database."
  type        = string
  default     = "oneclick"
}

variable "postgres_password" {
  description = "PostgreSQL password for the EC2 container database."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret. Must be at least 32 characters."
  type        = string
  sensitive   = true
}

variable "oneclick_secret_key" {
  description = "Secret encryption key for stored service environment values. Must be at least 32 characters."
  type        = string
  sensitive   = true
}

variable "worker_build_timeout" {
  description = "Maximum seconds allowed for one Docker build."
  type        = number
  default     = 900
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
