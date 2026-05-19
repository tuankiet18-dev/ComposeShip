<p align="center">
  <img src="assets/logo_v1.png" alt="OneClick-Host Logo" width="200"/>
</p>

# OneClick-Host 🚀

<p align="center">
  <strong>A Premium Self-Hosted Platform as a Service (PaaS)</strong><br />
  <em>Deploy your GitHub repositories with a single click. Zero DevOps, Maximum Control.</em>
</p>

---

OneClick-Host is a sophisticated, self-hosted deployment platform engineered for researchers, students, and small project teams. It serves as your private cloud infrastructure—similar to Vercel or Heroku—but entirely under your control. Simply provide a GitHub repository, and the platform handles the rest: stack detection, automated containerization, and live deployment with dynamic routing.

![Dashboard Preview](assets/dashboard_new.png)

## ✨ Core Features

*   **⚡ Zero-Config Deployments:** Just paste your GitHub URL and watch the magic happen.
*   **🔍 Intelligent Stack Detection:** Automatically recognizes React, Next.js, ASP.NET Core, and Spring Boot.
*   **📦 Automated Dockerization:** Generates optimized `Dockerfile`s on the fly, adhering to production best practices.
*   **🌐 Dynamic Routing:** Seamlessly maps apps to subdomains (e.g., `http://frontend-forum.localhost`) via Traefik.
*   **📂 Monorepo Support:** Deploy specific subdirectories with ease—perfect for full-stack monorepos.
*   **📊 Real-Time Logs:** Native streaming of Docker build logs directly in your dashboard.

## 🏗️ Technical Architecture

The platform leverages a robust microservices architecture orchestrated via Docker Compose:

| Component | Technology Stack | Responsibility |
|:---|:---|:---|
| **🎨 Frontend** | Next.js 15, Tailwind, shadcn/ui | Modern, responsive dashboard for managing services and deployments. |
| **⚙️ API** | ASP.NET Core (.NET 10) | High-performance REST API managing state and deployment queues. |
| **🤖 Worker** | Python 3.12 | Orchestration daemon using Docker SDK for cloning, building, and running. |
| **🗄️ Database** | PostgreSQL 16 | Reliable persistence for project configurations and build history. |
| **🛣️ Proxy** | Traefik v3.4 | Edge router providing dynamic load balancing and subdomain management. |

### The Deployment Pipeline

1. **Submission:** User enters a GitHub URL in the Next.js Dashboard.
2. **Queuing:** ASP.NET API validates the request and queues a `Pending` job in PostgreSQL.
3. **Detection:** The Python Worker clones the repo and executes `stack_detector.py`.
4. **Generation:** If no `Dockerfile` exists, `dockerfile_generator.py` injects a custom-tailored template.
5. **Execution:** `build_runner.py` builds the image and deploys the container to the internal `oneclick-net`.
6. **Routing:** A YAML routing configuration is generated for Traefik, enabling instant global access.

## 💻 Supported Ecosystems

OneClick-Host provides first-class support for the following stacks out of the box:

- **Frontend:** React (Vite/CRA), Next.js
- **Backend:** ASP.NET Core (.NET 10), Java Spring Boot (Maven/Gradle)

> [!TIP]
> Have a custom environment? Just include your own `Dockerfile` in the root of your repository, and OneClick-Host will prioritize it!

## 🚀 Getting Started

### Prerequisites
- Docker & Docker Compose
- Git

### Installation & Setup

1. **Clone the Repo:**
   ```bash
   git clone https://github.com/HienMinh58/oneclick-host.git
   cd oneclick-host
   ```

2. **Launch Infrastructure:**
   ```bash
   docker compose up -d --build
   ```

3. **Access Your Dashboard:**
   - **Dashboard:** [http://localhost:3000](http://localhost:3000)
   - **API Docs:** [http://localhost:5000/swagger](http://localhost:5000/swagger)
   - **Traefik Hub:** [http://localhost:8081](http://localhost:8081)

## 🌍 Production Deployment

Ready to go live?
1. Deploy to an Ubuntu VPS or AWS EC2 instance.
2. Configure a Wildcard DNS record (e.g., `*.yourdomain.com`) to your server IP.
3. Set `TRAEFIK_DOMAIN=yourdomain.com` in your `.env`.
4. Run `docker compose up -d`.
5. Your apps are now live at `http://{service}-{project}.yourdomain.com`!

### AWS EC2 MVP With Terraform

For dev/test AWS deployment, use the EC2-only Terraform stack in [`infra/aws/dev`](infra/aws/dev). It provisions one Ubuntu EC2 instance, an Elastic IP, a security group, Docker, Traefik, the API, the frontend, the worker, and a local PostgreSQL container.

No purchased domain is required for the MVP path. Leave `domain_name = ""` and the stack will use `<public-ip>.sslip.io`, for example:

```text
http://18.136.132.209.sslip.io
```

Full setup and troubleshooting guides:

- [`infra/aws/dev/README.md`](infra/aws/dev/README.md)
- [`docs/aws-terraform-infra-guide.md`](docs/aws-terraform-infra-guide.md)

## 🛡️ CI/CD & Reliability

Our internal pipeline ensures stability across all components:
- **Frontend/Backend:** Automated builds and linting.
- **Worker:** Strict Python syntax validation and Docker SDK integration tests.
- **Docker:** Infrastructure validation for complex multi-container setups.

## 📄 License

This project is licensed under the MIT License.

