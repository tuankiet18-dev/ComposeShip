# Huong Dan Terraform Infra AWS Cho OneClick-Host

Tai lieu nay giai thich bo infra Terraform moi cua OneClick-Host va cach dung no de tao moi truong AWS dev/test tren mot EC2 duy nhat.

Infra hien tai nam tai:

```text
infra/aws/dev
```

## 1. Terraform La Gi?

Terraform la cong cu tao ha tang bang code.

Thay vi vao AWS Console bam tay de tao EC2, Security Group, Elastic IP, IAM role, ban viet cac file `.tf`. Sau do Terraform doc cac file nay va tao ha tang tren AWS theo dung mo ta.

Voi du an nay, Terraform se tao:

- Mot EC2 Ubuntu de chay OneClick-Host.
- Mot Elastic IP co dinh gan vao EC2.
- Mot Security Group mo port `80` cho web va port `22` cho SSH.
- Mot IAM role toi thieu de EC2 co the dung AWS Systems Manager sau nay.
- Mot script khoi dong EC2 lan dau de cai Docker, clone repo, tao `.env`, va chay Docker Compose.

Ket qua la ban co server AWS chay day du:

```text
Internet
  -> Elastic IP
  -> EC2
  -> Traefik
  -> Frontend / API / User Containers
  -> Postgres container
```

## 2. Cac File Quan Trong

Thu muc [infra/aws/dev](../infra/aws/dev) gom cac file chinh:

| File | Vai tro |
| --- | --- |
| `versions.tf` | Khai bao Terraform version va AWS provider. |
| `variables.tf` | Khai bao cac bien cau hinh nhu region, key pair, password, instance type. |
| `main.tf` | Tao EC2, Elastic IP, Security Group, IAM role. |
| `outputs.tf` | In ra IP, URL app, lenh SSH sau khi deploy. |
| `terraform.tfvars.example` | File mau de copy thanh `terraform.tfvars`. |
| `templates/user_data.sh.tftpl` | Script chay tren EC2 lan dau de cai Docker va start app. |
| `README.md` | Huong dan ngan gon rieng cho stack Terraform. |

Ngoai ra co 2 file lien quan den runtime EC2:

| File | Vai tro |
| --- | --- |
| [docker-compose.ec2.yml](../docker-compose.ec2.yml) | Override Docker Compose khi chay tren EC2, chi expose Traefik ra internet. |
| [traefik/traefik.ec2.yml](../traefik/traefik.ec2.yml) | Cau hinh Traefik cho Linux EC2, bat Docker provider va file provider. |

## 3. Khong Co Domain Thi Truy Cap Bang Gi?

Ban khong can mua domain.

Neu de:

```hcl
domain_name = ""
```

Terraform se tu dung dang:

```text
<public-ip>.sslip.io
```

Vi du EC2 co IP:

```text
13.250.10.20
```

Dashboard se nam o:

```text
http://13.250.10.20.sslip.io
```

User containers van co subdomain rieng:

```text
http://frontend-demo.13.250.10.20.sslip.io
```

`sslip.io` la mot dich vu DNS mien phi: bat ky domain nao co dang `IP.sslip.io` se tu resolve ve IP do. Cach nay hop voi dev/test vi khong can cau hinh DNS.

## 4. Chuan Bi Truoc Khi Chay

Ban can co:

- AWS account.
- AWS CLI da cau hinh credentials, hoac bien moi truong AWS credentials.
- Terraform da cai tren may.
- Mot EC2 key pair da ton tai trong AWS region ban dung.
- Public IP cua may ban de mo SSH, vi du `203.0.113.10/32`.

Kiem tra AWS CLI:

```bash
aws sts get-caller-identity
```

Kiem tra Terraform:

```bash
terraform version
```

## 5. Cau Hinh Bien Terraform

Di vao thu muc Terraform:

```bash
cd infra/aws/dev
```

Copy file mau:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Tren PowerShell Windows:

```powershell
Copy-Item terraform.tfvars.example terraform.tfvars
```

Mo `terraform.tfvars` va sua cac gia tri quan trong:

```hcl
aws_region = "ap-southeast-1"

domain_name = ""

instance_type = "t3.medium"
key_name      = "ten-key-pair-cua-ban"

admin_cidr_blocks = ["public-ip-cua-ban/32"]

postgres_password = "mat-khau-db-manh"
jwt_secret = "chuoi-random-it-nhat-32-ky-tu"
oneclick_secret_key = "chuoi-random-khac-it-nhat-32-ky-tu"
```

Giu `domain_name = ""` neu ban khong co domain.

`admin_cidr_blocks` nen la IP public cua may ban kem `/32`, vi du:

```hcl
admin_cidr_blocks = ["14.231.22.10/32"]
```

Khong nen dung:

```hcl
admin_cidr_blocks = ["0.0.0.0/0"]
```

vi nhu vay ai cung co the SSH vao EC2 neu co key.

## 6. Tao Infra

Chay lan luot:

```bash
terraform init
terraform fmt
terraform validate
terraform plan
terraform apply
```

Y nghia tung lenh:

| Lenh | Y nghia |
| --- | --- |
| `terraform init` | Tai AWS provider va khoi tao thu muc Terraform. |
| `terraform fmt` | Format cac file `.tf`. |
| `terraform validate` | Kiem tra cau truc file Terraform. |
| `terraform plan` | Xem Terraform se tao/sua/xoa gi, chua thay doi AWS. |
| `terraform apply` | Thuc su tao ha tang tren AWS. |

Khi `terraform apply` hoi confirm, nhap:

```text
yes
```

Sau khi xong, Terraform se in ra cac output, vi du:

```text
public_ip = "13.250.10.20"
effective_domain = "13.250.10.20.sslip.io"
app_url = "http://13.250.10.20.sslip.io"
```

Mo URL trong `app_url` de vao dashboard.

## 7. EC2 Se Tu Lam Gi Sau Khi Tao?

File [templates/user_data.sh.tftpl](../infra/aws/dev/templates/user_data.sh.tftpl) la script chay mot lan khi EC2 boot lan dau.

Script nay lam cac viec:

1. Cai package can thiet.
2. Cai Docker Engine va Docker Compose plugin.
3. Clone repo vao:

   ```text
   /opt/oneclick-host
   ```

4. Checkout branch/ref duoc cau hinh trong `repository_ref`.
5. Tao file `.env` tren EC2.
6. Ghi lai `traefik/dynamic/dashboard.yml` theo domain EC2 dang dung.
7. Tao systemd service `oneclick-host`.
8. Chay:

   ```bash
   systemctl start oneclick-host.service
   ```

Systemd service nay se goi:

```bash
docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --build
```

Neu EC2 reboot, service se tu start lai stack.

Neu deploy mat vai phut sau khi Terraform apply xong, do EC2 dang build image frontend/backend/worker. Xem log bootstrap bang:

```bash
sudo tail -200 /var/log/oneclick-bootstrap.log
```

## 8. SSH Vao EC2 Va Kiem Tra

Lay lenh SSH tu output:

```bash
terraform output ssh_command
```

Lenh se co dang:

```bash
ssh -i <path-to-private-key> ubuntu@13.250.10.20
```

Sau khi SSH vao EC2:

```bash
cd /opt/oneclick-host
docker compose -f docker-compose.yml -f docker-compose.ec2.yml ps
```

Neu gap loi `.env: permission denied`, sua quyen:

```bash
cd /opt/oneclick-host
sudo chown -R ubuntu:ubuntu /opt/oneclick-host
sudo chmod 0640 .env
```

Xem log API:

```bash
docker logs oneclick-api
```

Xem log Traefik:

```bash
docker logs oneclick-traefik
```

Restart stack:

```bash
sudo systemctl restart oneclick-host
```

Xem service log:

```bash
sudo journalctl -u oneclick-host -n 200 --no-pager
```

Test routing noi bo qua Traefik:

```bash
cd /opt/oneclick-host
DOMAIN=$(grep '^TRAEFIK_DOMAIN=' .env | cut -d= -f2)
curl -i -H "Host: $DOMAIN" http://127.0.0.1/
curl -i -H "Host: $DOMAIN" http://127.0.0.1/health
```

Cach doc ket qua:

- `200` hoac HTML: Traefik va app dang route dung.
- `404 page not found`: request da vao Traefik nhung khong co router nao match `Host`.
- `502 Bad Gateway`: Traefik match router nhung khong ket noi duoc container dich.
- `connection refused`: Traefik chua listen port `80` hoac container Traefik chua chay.

## 9. Vi Sao Can docker-compose.ec2.yml?

File `docker-compose.yml` goc dang phuc vu local dev, nen no expose:

- Frontend: `3000`
- API: `5000`
- Postgres: `5433`
- Traefik: `80`, `8081`

Tren EC2, ta khong muon public truc tiep `3000`, `5000`, `5433`.

Vi vay [docker-compose.ec2.yml](../docker-compose.ec2.yml) override lai:

- Xoa port public cua Postgres.
- Xoa port public cua API.
- Xoa port public cua Frontend.
- Chi giu Traefik port `80`.
- Gan label Traefik theo `TRAEFIK_DOMAIN`.
- Truyen `NEXT_PUBLIC_API_URL` vao luc build frontend.
- Set `DOCKER_API_VERSION` cho Traefik de Docker provider noi chuyen dung voi Docker daemon moi.

Ket qua:

```text
Public internet -> Traefik :80 -> frontend/api/user containers
```

Postgres chi nam trong Docker network noi bo.

Ngoai Docker provider, bootstrap EC2 cung ghi de `traefik/dynamic/dashboard.yml` theo domain thuc te, vi du `47.131.207.154.sslip.io`. Day la fallback qua file provider de dashboard/API van route duoc neu Docker provider gap su co.

Neu EC2 da duoc tao truoc khi bootstrap co fallback nay, ban co the tu regenerate route file:

```bash
cd /opt/oneclick-host
DOMAIN=$(grep '^TRAEFIK_DOMAIN=' .env | cut -d= -f2)

cat > traefik/dynamic/dashboard.yml <<EOF
http:
  routers:
    api-router:
      rule: "Host(\`$DOMAIN\`) && (PathPrefix(\`/api\`) || Path(\`/health\`))"
      service: api-service
      entryPoints:
        - web
      priority: 100

    frontend-router:
      rule: "Host(\`$DOMAIN\`)"
      service: frontend-service
      entryPoints:
        - web
      priority: 1

  services:
    api-service:
      loadBalancer:
        servers:
          - url: "http://api:5000"

    frontend-service:
      loadBalancer:
        servers:
          - url: "http://frontend:3000"
EOF

sudo docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --force-recreate traefik
```

## 10. Bao Mat Va Gioi Han

Day la infra dev/test, chua phai production.

Can luu y:

- Chua co HTTPS.
- Postgres la container tren EC2, chua phai RDS.
- Terraform state co the chua secret, nen khong commit state.
- `.env` tren EC2 co secret, chi user co SSH moi nen doc duoc.
- Worker mount Docker socket, nen EC2 nay can duoc xem la trusted host.
- Traefik dashboard port `8081` bi chan o Security Group mac dinh.

Neu muon bat dashboard, set:

```hcl
enable_traefik_dashboard_port = true
```

Nhung chi nen de `admin_cidr_blocks` la IP cua ban.

## 11. Xoa Infra Khi Khong Dung

De tranh ton tien AWS:

```bash
terraform destroy
```

Terraform se hoi confirm. Nhap:

```text
yes
```

Lenh nay se xoa EC2, Elastic IP, Security Group, IAM resources do Terraform tao.

Luu y: du lieu Postgres nam trong EBS root volume cua EC2. Khi destroy, du lieu do se mat theo EC2.

## 12. Loi Thuong Gap

### Khong vao duoc app_url

Kiem tra EC2 da boot va Docker da chay:

```bash
ssh -i <key> ubuntu@<public-ip>
cd /opt/oneclick-host
docker compose -f docker-compose.yml -f docker-compose.ec2.yml ps
```

Neu container dang build hoac crash, xem logs:

```bash
sudo tail -200 /var/log/oneclick-bootstrap.log
sudo journalctl -u oneclick-host -n 200 --no-pager
docker logs oneclick-api
docker logs oneclick-frontend
docker logs oneclick-traefik
```

Kiem tra Traefik route bang Host header:

```bash
cd /opt/oneclick-host
DOMAIN=$(grep '^TRAEFIK_DOMAIN=' .env | cut -d= -f2)
curl -i -H "Host: $DOMAIN" http://127.0.0.1/
curl -i -H "Host: $DOMAIN" http://127.0.0.1/health
```

Neu ket qua la `404 page not found`, kiem tra route file co dung domain khong:

```bash
cat traefik/dynamic/dashboard.yml
grep TRAEFIK_DOMAIN .env
```

`dashboard.yml` phai dung domain trong `.env`, khong phai `localhost`.

### Traefik bao Docker API qua cu

Neu log Traefik co loi:

```text
client version 1.24 is too old. Minimum supported API version is 1.40
```

Kiem tra Traefik container co env override chua:

```bash
sudo docker inspect oneclick-traefik --format '{{range .Config.Env}}{{println .}}{{end}}' | grep DOCKER_API_VERSION
```

Ket qua nen co:

```text
DOCKER_API_VERSION=1.44
```

Neu thieu, update `docker-compose.ec2.yml`, roi recreate Traefik:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.ec2.yml up -d --force-recreate traefik
```

### Khong SSH duoc

Kiem tra:

- `key_name` co dung EC2 key pair trong region khong.
- Security Group co mo port `22` cho IP cua ban khong.
- `admin_cidr_blocks` co dung IP public hien tai cua ban khong.

### Deploy user app khong mo duoc URL

Kiem tra `TRAEFIK_DOMAIN` trong `.env` tren EC2:

```bash
cd /opt/oneclick-host
grep TRAEFIK_DOMAIN .env
```

No nen la:

```text
<public-ip>.sslip.io
```

Kiem tra worker:

```bash
docker logs oneclick-worker
```

Kiem tra Traefik dynamic config:

```bash
ls -la traefik/dynamic
```

### Het disk khi build app

Tang:

```hcl
root_volume_size_gb = 80
```

Sau do chay lai:

```bash
terraform plan
terraform apply
```

## 13. Khi Nao Can Nang Cap Len Production?

Khi du an het giai doan dev/test, nen can nhac:

- Dung domain that va HTTPS.
- Dua Postgres sang Amazon RDS.
- Backup database ra S3.
- Them monitoring/logging.
- Gioi han tai nguyen user containers chat hon.
- Tach build worker khoi EC2 web host neu tai tang.
- Luu Terraform state trong S3 backend thay vi local.
