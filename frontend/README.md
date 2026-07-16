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

To run the complete local stack with production-like frontend assets:

```bash
cd ..
docker compose up -d --build
```

Use `npm run dev` from this directory when frontend hot reload is required.
