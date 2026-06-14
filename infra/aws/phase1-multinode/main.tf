locals {
  deployment_path = "/opt/oneclick-host"
  vpc_cidr        = "10.42.0.0/16"
  public_cidr     = "10.42.1.0/24"
  private_cidr    = "10.42.2.0/24"
  domain_name     = "${aws_eip.control_plane.public_ip}.sslip.io"

  postgres_password                 = var.postgres_password != "" ? var.postgres_password : random_password.postgres_password.result
  jwt_secret                        = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
  oneclick_secret_key               = var.oneclick_secret_key != "" ? var.oneclick_secret_key : random_password.oneclick_secret_key.result
  execution_node_registration_token = var.execution_node_registration_token != "" ? var.execution_node_registration_token : random_password.execution_node_registration_token.result
  execution_node_token              = var.execution_node_token != "" ? var.execution_node_token : random_password.execution_node_token.result

  common_tags = {
    Project     = var.project_name
    Environment = "phase1"
    ManagedBy   = "terraform"
  }
}

resource "random_password" "postgres_password" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

resource "random_password" "oneclick_secret_key" {
  length  = 48
  special = false
}

resource "random_password" "execution_node_registration_token" {
  length  = 48
  special = false
}

resource "random_password" "execution_node_token" {
  length  = 48
  special = false
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu_arm64" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_vpc" "main" {
  cidr_block           = local.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-vpc"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-igw"
  })
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-public-a"
  })
}

resource "aws_subnet" "private" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.private_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-private-a"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block           = "0.0.0.0/0"
    network_interface_id = aws_network_interface.control_plane.id
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-private-rt"
  })
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "control_plane" {
  name        = "${var.project_name}-control-plane-sg"
  description = "Control-plane public HTTP, admin SSH, and private node traffic"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Public HTTP through Traefik"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Admin SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.admin_cidr_blocks
  }

  ingress {
    description = "Private subnet traffic for NAT and control-plane API"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [local.private_cidr]
  }

  egress {
    description = "Outbound internet and private VPC access"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-control-plane-sg"
  })
}

resource "aws_security_group" "execution_node" {
  name        = "${var.project_name}-execution-node-sg"
  description = "Execution-node private-only workload host"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Control-plane Traefik to published app ports"
    from_port   = 1024
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["${aws_network_interface.control_plane.private_ip}/32"]
  }

  ingress {
    description = "Admin SSH through private network only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [local.public_cidr]
  }

  egress {
    description = "Outbound via control-plane NAT instance and private API access"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-execution-node-sg"
  })
}

resource "aws_iam_role" "ec2" {
  name = "${var.project_name}-ec2-role"

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
  name = "${var.project_name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

resource "aws_network_interface" "control_plane" {
  subnet_id         = aws_subnet.public.id
  private_ips       = ["10.42.1.10"]
  security_groups   = [aws_security_group.control_plane.id]
  source_dest_check = false

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-control-plane-eni"
  })
}

resource "aws_instance" "control_plane" {
  ami                  = data.aws_ami.ubuntu_arm64.id
  instance_type        = var.control_plane_instance_type
  key_name             = var.key_name
  iam_instance_profile = aws_iam_instance_profile.ec2.name

  network_interface {
    network_interface_id = aws_network_interface.control_plane.id
    device_index         = 0
  }

  user_data_replace_on_change = true
  user_data = templatefile("${path.module}/templates/control_plane_user_data.sh.tftpl", {
    deployment_path                   = local.deployment_path
    repository_url                    = var.repository_url
    repository_ref                    = var.repository_ref
    domain_name                       = local.domain_name
    control_plane_private_ip          = aws_network_interface.control_plane.private_ip
    postgres_db                       = var.postgres_db
    postgres_user                     = var.postgres_user
    postgres_password                 = local.postgres_password
    jwt_secret                        = local.jwt_secret
    oneclick_secret_key               = local.oneclick_secret_key
    execution_node_registration_token = local.execution_node_registration_token
    worker_build_timeout              = var.worker_build_timeout
    max_concurrent_builds             = var.max_concurrent_builds
    container_memory_limit            = var.container_memory_limit
    container_cpu_limit               = var.container_cpu_limit
    container_pids_limit              = var.container_pids_limit
  })

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.control_plane_root_volume_size_gb
    delete_on_termination = true
    encrypted             = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-control-plane"
  })
}

resource "aws_launch_template" "execution_node" {
  name_prefix   = "${var.project_name}-execution-node-"
  image_id      = data.aws_ami.ubuntu_arm64.id
  instance_type = var.execution_node_instance_type
  key_name      = var.key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.ec2.name
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.execution_node.id]
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  user_data = base64encode(templatefile("${path.module}/templates/execution_node_user_data.sh.tftpl", {
    deployment_path                   = local.deployment_path
    repository_url                    = var.repository_url
    repository_ref                    = var.repository_ref
    domain_name                       = local.domain_name
    control_plane_private_ip          = aws_network_interface.control_plane.private_ip
    execution_node_token              = local.execution_node_token
    execution_node_registration_token = local.execution_node_registration_token
    worker_build_timeout              = var.worker_build_timeout
    max_concurrent_builds             = var.max_concurrent_builds
    container_memory_limit            = var.container_memory_limit
    container_cpu_limit               = var.container_cpu_limit
    container_pids_limit              = var.container_pids_limit
  }))

  block_device_mappings {
    device_name = "/dev/sda1"

    ebs {
      volume_type           = "gp3"
      volume_size           = var.execution_node_root_volume_size_gb
      delete_on_termination = true
      encrypted             = true
    }
  }

  tag_specifications {
    resource_type = "instance"

    tags = merge(local.common_tags, {
      Name = "${var.project_name}-execution-node"
    })
  }

  tag_specifications {
    resource_type = "volume"

    tags = merge(local.common_tags, {
      Name = "${var.project_name}-execution-node-root"
    })
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-execution-node-lt"
  })
}

resource "aws_autoscaling_group" "execution_nodes" {
  name                = "${var.project_name}-execution-nodes"
  min_size            = var.execution_node_min_size
  desired_capacity    = var.execution_node_desired_capacity
  max_size            = var.execution_node_max_size
  vpc_zone_identifier = [aws_subnet.private.id]

  launch_template {
    id      = aws_launch_template.execution_node.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.project_name}-execution-node"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  depends_on = [
    aws_instance.control_plane,
    aws_route_table_association.private
  ]
}

resource "aws_eip" "control_plane" {
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-control-plane-eip"
  })
}

resource "aws_eip_association" "control_plane" {
  network_interface_id = aws_network_interface.control_plane.id
  allocation_id        = aws_eip.control_plane.id
}
