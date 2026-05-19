locals {
  name_prefix      = var.project_name
  deployment_path  = "/opt/oneclick-host"
  effective_domain = trimspace(var.domain_name) != "" ? trimspace(var.domain_name) : "${aws_eip.oneclick.public_ip}.sslip.io"
  common_tags = {
    Project     = var.project_name
    Environment = "dev"
    ManagedBy   = "terraform"
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "oneclick" {
  name        = "${local.name_prefix}-ec2-sg"
  description = "OneClick-Host dev EC2 ingress"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP through Traefik"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH from admin networks"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.admin_cidr_blocks
  }

  dynamic "ingress" {
    for_each = var.enable_traefik_dashboard_port ? [1] : []
    content {
      description = "Traefik dashboard from admin networks"
      from_port   = 8081
      to_port     = 8081
      protocol    = "tcp"
      cidr_blocks = var.admin_cidr_blocks
    }
  }

  egress {
    description = "Outbound internet access for package installs, git clone, and image pulls"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ec2-sg"
  })
}

resource "aws_iam_role" "ec2" {
  name = "${local.name_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2.name
}

resource "aws_instance" "oneclick" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  key_name                    = var.key_name
  vpc_security_group_ids      = [aws_security_group.oneclick.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/templates/user_data.sh.tftpl", {
    deployment_path        = local.deployment_path
    repository_url         = var.repository_url
    repository_ref         = var.repository_ref
    domain_name            = local.effective_domain
    postgres_db            = var.postgres_db
    postgres_user          = var.postgres_user
    postgres_password      = var.postgres_password
    jwt_secret             = var.jwt_secret
    oneclick_secret_key    = var.oneclick_secret_key
    worker_build_timeout   = var.worker_build_timeout
    container_memory_limit = var.container_memory_limit
    container_cpu_limit    = var.container_cpu_limit
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    delete_on_termination = true
    encrypted             = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-dev"
  })
}

resource "aws_eip" "oneclick" {
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-dev-eip"
  })
}

resource "aws_eip_association" "oneclick" {
  instance_id   = aws_instance.oneclick.id
  allocation_id = aws_eip.oneclick.id
}
