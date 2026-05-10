# 📦 OneClick-Host Worker

The **Worker** is the backbone of the OneClick-Host platform. It is a Python-based service responsible for the automated lifecycle of user deployments: from cloning source code to serving live containers.

---

## 🚀 Deployment Pipeline

The worker operates on a sequential 5-step pipeline for every deployment:

1.  **Clone (`repo_cloner.py`)**: 
    *   Performs a **Shallow Clone** (`depth=1`) for maximum speed.
    *   Downloads only the requested branch and subfolder.
    *   Creates a unique workspace per deployment.

2.  **Detect Stack (`stack_detector.py`)**:
    *   Analyzes the project files to identify the technology stack.
    *   **Supported Stacks**: ASP.NET Core, Spring Boot (Maven/Gradle), Next.js, React (Vite/CRA).

3.  **Generate Dockerfile (`dockerfile_generator.py`)**:
    *   Injects a technology-specific `Dockerfile` into the workspace.
    *   Uses optimized multi-stage builds to keep production images small.

4.  **Build Image (`build_runner.py`)**:
    *   Triggers `docker build` via the Docker SDK.
    *   Streams real-time build logs back to the database for the user dashboard.

5.  **Deploy Container (`build_runner.py`)**:
    *   Runs the container with isolated resource limits.
    *   Injects **Environment Variables** from the database.
    *   Configures **Traefik Labels** for dynamic routing and SSL termination.

---

## 🛠️ Architecture Highlights

### Lazy Initialization
The Docker client is initialized using a "Lazy" pattern. It only connects to the Docker daemon when a build or run command is actually executed. This prevents the worker from crashing during startup if Docker is temporarily unavailable.

### Shallow Clones
By using `depth=1`, we avoid downloading the entire Git history (which could be gigabytes for old projects). This reduces deployment time by up to 90% for large repositories.

### Atomic Polling
The worker uses PostgreSQL's `FOR UPDATE SKIP LOCKED` mechanism. This ensures that multiple workers can run in parallel without ever processing the same deployment twice.

---

## 📂 Project Structure

```text
worker/
├── main.py              # Main entry point & polling loop
├── db.py                # Database interaction (PostgreSQL)
├── config.py            # Environment configuration
├── modules/
│   ├── repo_cloner.py   # Git operations
│   ├── stack_detector.py # Logic for identifying tech stacks
│   ├── dockerfile_generator.py # Template management
│   └── build_runner.py  # Docker SDK orchestration
└── templates/           # Base Dockerfiles for each stack
```

---

## 🔧 Development

### Prerequisites
- Python 3.9+
- Docker Engine
- PostgreSQL

### Running Locally
1. Install dependencies: `pip install -r requirements.txt`
2. Configure `.env` with `DATABASE_URL` and `POLL_INTERVAL`.
3. Start the worker: `python main.py`
