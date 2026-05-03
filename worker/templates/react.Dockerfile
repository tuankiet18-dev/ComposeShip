# ─────────────────────────────────────
# React (Vite/CRA) Dockerfile Template
# ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build
COPY . .
RUN npm run build

# Normalize build output folder (dist for Vite, build for CRA)
RUN mkdir -p /app/output && \
    if [ -d /app/dist ]; then cp -r /app/dist/* /app/output/; \
    elif [ -d /app/build ]; then cp -r /app/build/* /app/output/; \
    else echo "No supported React build output found. Expected /app/dist or /app/build" && exit 1; \
    fi

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/output /usr/share/nginx/html

# SPA fallback
RUN echo 'server { listen 80; root /usr/share/nginx/html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

EXPOSE 80
