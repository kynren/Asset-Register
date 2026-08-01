FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

COPY server server
RUN npm run build -w server

FROM node:20-slim AS runtime
# ffmpeg powers the RTSP-to-HLS relay for camera live view/recording; iputils-ping and net-tools
# (arp) back the real network ping/discovery features. tzdata is required for the TZ env var
# (see docker-compose.yml) to actually take effect — without it, Node/date silently fall back to
# UTC no matter what TZ is set to, which is exactly the kind of thing that makes a Lighting
# Automation look like it fires at the wrong hour (or never) for no visible reason.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg iputils-ping net-tools openssl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 4000

# Applies any pending Prisma migrations before starting — safe to run on every boot,
# it's a no-op when the schema is already up to date.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
