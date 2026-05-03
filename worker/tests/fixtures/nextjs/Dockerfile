# ─────────────────────────────────────
# Next.js Dockerfile Template
# ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Build
COPY . .
RUN npm run build

# Runtime
FROM node:20-alpine
WORKDIR /app

# Copy everything from build stage
COPY --from=build /app ./

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "start"]
