# OneClickHost AWS Phase 1 Multi-Node

This stack is the cheapest practical AWS production shape for public, untrusted
Compose repos in `ap-southeast-1`:

- one public control-plane EC2 instance;
- one private-only execution-node Auto Scaling Group, defaulting to one EC2
  instance for the cheapest recovery-ready baseline;
- one Elastic IP and `sslip.io` HTTP routing;
- no NAT Gateway, no ALB, no RDS, no ECR requirement;
- control-plane acts as a small NAT instance for the private execution-node.

## Architecture

```text
Internet
  -> http://<control-plane-eip>.sslip.io
  -> control-plane EC2 public subnet
       - Traefik file provider on :80
       - API on private :5000
       - Frontend
       - PostgreSQL container
       - Dispatcher worker without Docker socket
       - NAT instance iptables for private subnet outbound

execution-node Auto Scaling Group in private subnet
  - no public IPv4
  - default min/desired/max: 1/1/2
  - replacement nodes register themselves with a unique EC2 instance id name
  - worker executor with Docker socket
  - user Compose workloads
  - selected app ports bind to private IP only
```

## Cost Shape

Default sizing:

| Resource | Default |
|---|---|
| Control-plane EC2 | `t4g.small` |
| Execution-node ASG | `min=1`, `desired=1`, `max=2` |
| Execution-node EC2 type | `t4g.small` |
| Control-plane EBS gp3 | 20 GB |
| Execution-node EBS gp3 | 40 GB |
| Public IPv4 | 1 Elastic IP |

Approximate baseline in Singapore is about 2 small Graviton instances plus 60 GB
gp3 and one public IPv4. Outbound internet transfer is separate and depends on
traffic. Increase only `execution_node_instance_type` to `t4g.medium` first if
Docker builds fail due to memory.

## Usage

1. Copy variables:

   ```bash
   cd infra/aws/phase1-multinode
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit:

   - `key_name`
   - `admin_cidr_blocks`
   - `repository_ref` to the branch you want to deploy

   Leave secrets empty unless you need fixed values; Terraform will generate
   them. Keep `terraform.tfstate` private because generated secrets are stored
   there.

3. Deploy:

   ```bash
   terraform init
   terraform fmt
   terraform validate
   terraform plan
   terraform apply
   ```

4. Open:

   ```bash
   terraform output app_url
   ```

## Operations

SSH to control-plane:

```bash
terraform output control_plane_ssh_command
```

SSH to an execution-node through the control-plane bastion. First discover the
node private IP from the ASG/EC2 console or AWS CLI, then use:

```bash
terraform output execution_node_ssh_command
```

Check services:

```bash
sudo journalctl -u oneclick-control-plane -n 200 --no-pager
sudo journalctl -u oneclick-execution-node -n 200 --no-pager
cd /opt/oneclick-host
sudo docker compose -f docker-compose.control-plane.phase1.yml --env-file .generated/multinode/control-plane.env ps
sudo docker compose -p oneclick-execution -f docker-compose.execution.yml --env-file .generated/multinode/execution-node.env ps
```

## Acceptance Test

In the dashboard, deploy the public fixture repo:

```text
https://github.com/tuankiet18-dev/oneclick-compose-fixture
```

Expected config:

| Route | Service | Port |
|---|---|---:|
| `app` | `frontend` | `3000` |
| `api` | `api` | `8000` |

Expected env:

```text
api.DATABASE_URL=postgresql://oneclick:oneclick@db:5432/oneclick_fixture
```

Expected URLs:

```text
http://app-<project-slug>.<control-plane-eip>.sslip.io
http://api-<project-slug>.<control-plane-eip>.sslip.io/health
http://api-<project-slug>.<control-plane-eip>.sslip.io/db-check
```

The database service must not have a public route.

## Remaining Risks

- The execution-node still mounts Docker socket by design; treat that VM as the
  untrusted workload boundary.
- This phase uses HTTP only. Add HTTPS with a real domain or Cloudflare Tunnel
  in the next phase.
- The control-plane NAT instance is cheaper than NAT Gateway but less managed.
  If traffic grows or uptime requirements increase, replace it with NAT Gateway
  or a hardened NAT appliance.
- This stack uses ARM64 Graviton (`t4g.*`). Some user images may not publish ARM
  manifests; those repos will need Dockerfiles that build on ARM or a future x86
  execution-node pool.
