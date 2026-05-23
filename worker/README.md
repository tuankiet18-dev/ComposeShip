# OneClick-Host Worker

The worker is trusted infrastructure. It polls queued deployments, clones repositories, detects stacks, generates Dockerfiles when needed, builds images, runs containers, and writes Traefik file-provider routes.

## Deployment Pipeline

1. Clone a validated public GitHub HTTPS repository with `depth=1`.
2. Detect the stack.
3. Generate a Dockerfile when the repository does not provide one.
4. Build the image with `WORKER_BUILD_TIMEOUT`.
5. Start the app container on `oneclick-apps-net`.
6. Write a dynamic Traefik route for the app.
7. Clean up the temporary workspace.

## Security Notes

- The worker mounts `/var/run/docker.sock` and can control the host Docker daemon. Treat it as trusted control-plane infrastructure.
- Docker socket access is powerful; this architecture is not equivalent to strong sandboxing for hostile public workloads.
- User containers are started without Docker socket mounts, host mounts, privileged mode, or host-published ports.
- User containers are attached to `oneclick-apps-net`, not `oneclick-control-net`, so they should not directly reach PostgreSQL, API, or the worker.
- Resource limits are controlled by `CONTAINER_MEMORY_LIMIT`, `CONTAINER_CPU_LIMIT`, and `CONTAINER_PIDS_LIMIT`.

## Configuration

- `POLL_INTERVAL`: seconds between queue polls.
- `BUILD_TIMEOUT`: maximum seconds for a Docker image build.
- `MAX_CONCURRENT_BUILDS`: maximum deployment jobs this worker process runs at once.
- `WORKSPACE_DIR`: temporary clone/build workspace root.
- `TRAEFIK_DOMAIN`: base domain for generated app hostnames.
- `TRAEFIK_NETWORK`: Docker network for user app containers. Defaults to `oneclick-apps-net`.

## Development

```bash
pip install -r requirements.txt
python main.py
```
