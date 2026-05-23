# Angular Dockerfile Template
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci || npm install

COPY . .
RUN npm run build
RUN index_file="$(find dist -type f -name index.html -print | head -n 1)" \
    && output_dir="$(dirname "$index_file")" \
    && test -n "$output_dir" \
    && mkdir -p /app/nginx-root \
    && cp -r "$output_dir"/. /app/nginx-root/

FROM nginx:1.27-alpine
COPY --from=build /app/nginx-root /usr/share/nginx/html
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
