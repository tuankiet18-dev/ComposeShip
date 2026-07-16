# OneClickHost AWS Two-Node MVP

> **Approved topology, pre-release implementation:** the two-node boundary is
> the selected MVP direction. The dashboard/API are CloudFront HTTPS surfaces;
> user applications use temporary Cloudflare Quick Tunnel HTTPS previews.
> AWS verification and release gates in `docs/mvp-release-roadmap.md` remain
> mandatory before real users.

This stack is the cheapest practical AWS production shape for public, untrusted
Compose repos in `ap-southeast-1`:

- one public control-plane EC2 instance;
- one private-only execution-node Auto Scaling Group, defaulting to one EC2
  instance for the cheapest recovery-ready baseline;
- one Elastic IP for the control-plane CloudFront origin and admin diagnostics;
- one private S3 dashboard bucket and CloudFront HTTPS distribution;
- no NAT Gateway, no ALB, no RDS, no ECR requirement;
- control-plane acts as a small NAT instance for the private execution-node.

## Architecture

```text
Internet
  -> https://<distribution>.cloudfront.net
       - private S3 dashboard
       - /api/* forwarded to the control-plane origin
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
   cd infra/aws/mvp
   cp terraform.tfvars.example terraform.tfvars
   ```

2. Edit:

   - `key_name`
   - `admin_cidr_blocks`
   - `repository_ref` to the reviewed 40-character Git commit SHA you intend
     to deploy. The release topology rejects branches and mutable tags.

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

4. Publish the dashboard from the repository root:

   ```bash
   ./scripts/deploy-frontend-cloudfront.sh
   ```

5. Open:

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
sudo docker compose -f docker-compose.control-plane.yml --env-file .generated/multinode/control-plane.env ps
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

The pilot displays HTTPS Quick Tunnel URLs for configured public routes. They
are temporary and change after a stop, redeploy, or tunnel failure. The
control-plane EIP is an origin/admin diagnostic surface, not a user app URL;
direct viewer requests must not bypass the CloudFront origin header.

## Remaining Risks

- The execution-node still mounts Docker socket by design; treat that VM as the
  untrusted workload boundary.
- CloudFront and Quick Tunnel behavior must be verified against AWS before the
  pilot. A later purchased domain is required for stable user application URLs.
- The control-plane NAT instance is cheaper than NAT Gateway but less managed.
  If traffic grows or uptime requirements increase, replace it with NAT Gateway
  or a hardened NAT appliance.
- This stack uses ARM64 Graviton (`t4g.*`). Some user images may not publish ARM
  manifests; those repos will need Dockerfiles that build on ARM or a future x86
  execution-node pool.
