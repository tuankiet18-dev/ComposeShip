# OneClickHost Frontend

React + Vite + Tailwind frontend for OneClickHost.

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000` by default and reads the backend base URL from:

```bash
VITE_API_URL=http://localhost:5000/api
```

For Docker-based local development with hot reload:

```bash
docker compose -f ../docker-compose.yml -f ../docker-compose.dev.yml up frontend
```

`docker-compose.dev.yml` bind-mounts this folder into the container and runs Vite, so edits under `src/` update the browser immediately.
