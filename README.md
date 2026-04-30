# OneClick-Host

> Deploy your GitHub repos with one click. No DevOps knowledge required.

OneClick-Host is a SaaS web app for students and small project teams who want to deploy their projects without learning Docker, Kubernetes, or cloud infrastructure.

## What it does

1. Paste a GitHub repo URL
2. System auto-detects your tech stack
3. Builds your app with Docker
4. Deploys it on a server
5. Gives you a live URL

## Supported Stacks (MVP)

| Type | Stack |
|------|-------|
| Frontend | React (Vite / CRA), Next.js |
| Backend | ASP.NET Core, Java Spring Boot |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Dashboard | Next.js 15, Tailwind CSS, shadcn/ui |
| API | ASP.NET Core (.NET 9), EF Core, PostgreSQL |
| Worker | Python 3.12, Docker SDK, GitPython |
| Proxy | Traefik v3 |
| Database | PostgreSQL 16 |

## Architecture

See [implementation_plan.md](./implementation_plan.md) for full architecture, data flow, and database schema.

## Getting Started

> 🚧 Project is under active development. Setup instructions coming soon.

## License

MIT
