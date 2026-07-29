FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY client client
RUN npm run build -w client

# Caddy gives free, automatic Let's Encrypt HTTPS from a one-line Caddyfile — no manual
# certbot dance needed, as long as the domain's DNS already points at this server.
FROM caddy:2-alpine AS runtime
COPY --from=build /app/client/dist /srv
COPY client/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
