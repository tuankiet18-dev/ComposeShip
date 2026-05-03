# OneClick-Host 🚀

> A Self-Hosted Platform as a Service (PaaS) to deploy your GitHub repositories with one click. No DevOps knowledge required.

OneClick-Host is a lightweight, self-hosted deployment platform designed for students and small project teams. It acts as your own private version of Vercel or Heroku. You provide a GitHub repository, and the platform automatically detects the tech stack, containerizes the application, and deploys it live with automatic dynamic routing.

![Dashboard Preview](https://via.placeholder.com/800x400.png?text=OneClick-Host+Dashboard)

## ✨ What It Does

1. **Zero-Config Deployments:** Paste a GitHub URL, and the system automatically analyzes your codebase.
2. **Automatic Stack Detection:** Identifies frameworks (React, Next.js, ASP.NET Core, Spring Boot).
3. **Automated Dockerization:** Generates highly optimized `Dockerfile`s on the fly if your repo doesn't have one.
4. **Dynamic Routing:** Instantly maps your deployed application to a beautiful subdomain (e.g., `http://frontend-forum.localhost`) using Traefik.
5. **Monorepo Support:** Deploy specific subdirectories by specifying a `Subfolder` (e.g., deploying the `client` folder of a full-stack repo).
6. **Real-Time Logs:** Captures and displays the full Docker build logs natively in the dashboard.

## 🏗️ Architecture

The system is composed of five distinct microservices running in Docker Compose:

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **Frontend** | Next.js 15, Tailwind, shadcn/ui | The dashboard UI for managing projects, services, and viewing build logs. |
| **API** | ASP.NET Core (.NET 10) | REST API to handle CRUD operations and queue deployment jobs. |
| **Worker** | Python 3.12 | Background daemon that polls the database, clones GitHub repos, detects stacks, builds Docker images, and runs containers via the Docker SDK. |
| **Database** | PostgreSQL 16 | Stores users, projects, services, environment variables, and deployment build logs. |
| **Proxy** | Traefik v3.4 | Dynamic reverse proxy that automatically routes traffic to the dynamically spun-up user containers without port conflicts. |

### The Deployment Workflow

1. User submits a GitHub URL via the Next.js Dashboard.
2. The ASP.NET API queues a `Pending` deployment in PostgreSQL.
3. The Python Worker picks up the job via a thread-safe poll.
4. The Worker clones the repository into a temporary workspace.
5. `stack_detector.py` scans for package managers (`package.json`, `pom.xml`, `.csproj`).
6. `dockerfile_generator.py` injects a template if a Dockerfile is missing.
7. `build_runner.py` builds the Docker image and spins up the container on the `oneclick-net` Docker network.
8. The Worker dynamically generates a YAML routing file for Traefik.
9. Traefik hot-reloads and routes `http://{service}-{project}.localhost` to the new container.

## 💻 Supported Stacks (MVP)

If your repository doesn't have a `Dockerfile`, OneClick-Host will automatically generate one for:

*   **Frontend:** React (Vite/CRA), Next.js
*   **Backend:** ASP.NET Core (.NET 10), Java Spring Boot (Maven/Gradle)

*(Note: If you provide your own `Dockerfile` in the repository, OneClick-Host will respect it and build your custom environment!)*

## 🚀 Getting Started (Local Development)

To run your own private PaaS locally:

### Prerequisites
- Docker & Docker Compose
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/oneClick.git
   cd oneClick
   ```

2. **Start the infrastructure:**
   ```bash
   docker compose up -d --build
   ```

3. **Access the services:**
   - **Dashboard:** `http://localhost:3000`
   - **API Swagger:** `http://localhost:5000/swagger`
   - **Traefik Dashboard:** `http://localhost:8081`

4. **Deploy your first app:**
   - Register an account on the Dashboard.
   - Create a Project.
   - Click **Add Service**, paste a GitHub URL (e.g., a React app), and click Deploy!
   - Watch the build logs stream in, and click your Live URL when it's done.

## 🌍 Moving to Production (AWS / VPS)

To expose your platform to the public internet:
1. Rent an Ubuntu VPS or AWS EC2 instance.
2. Point a Wildcard Domain (e.g., `*.yourdomain.com`) to your server's IP address.
3. Update `TRAEFIK_DOMAIN=yourdomain.com` in your environment variables.
4. Run `docker compose up -d`.
5. All your deployments will now be accessible globally at `http://{service}-{project}.yourdomain.com`!

## 🛠️ CI/CD (GitHub Actions)

This project includes an automated CI pipeline to ensure code quality:
*   **Frontend:** Linting and building the Next.js application.
*   **Backend:** Restoring and building the ASP.NET Core API.
*   **Worker:** Syntax checking the Python daemon.
*   **Docker:** Validating compose configuration and verifying Dockerfile builds.

## 📄 License

MIT License
