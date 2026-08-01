# Deploying to a Hostinger VPS

This runs the whole stack — PostgreSQL, the Express API, and the React frontend — as three
Docker containers behind Caddy, which also handles free automatic HTTPS via Let's Encrypt.

Not covered here: the Python device agent (`agent/`). That runs on individual client machines
being tracked, not on the server — it just needs `API_BASE_URL` pointed at your domain.

## 1. Prerequisites

- A Hostinger VPS with root/SSH access.
- A domain (or subdomain) with its DNS **A record already pointing at the VPS's IP address**.
  Caddy won't be able to get a certificate until this resolves — you can deploy first with
  `SITE_DOMAIN=localhost` to smoke-test over plain HTTP, then switch to the real domain once
  DNS has propagated.

## 2. Install Docker on the VPS

SSH in, then:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in for the group change to apply. Confirm with `docker compose version`
(the Compose plugin ships with the convenience script above).

## 3. Get the code onto the VPS

Either clone directly (if the repo is on GitHub):

```bash
git clone <your-repo-url> kynren-asset-register
cd kynren-asset-register
```

...or push from your machine with `rsync`/`scp` if it's not on a git remote yet.

## 4. Configure secrets

```bash
cp .env.production.example .env
nano .env   # or vim/whatever's on the box
```

Fill in real values for `SITE_DOMAIN`, `CLIENT_ORIGIN` (same domain, with `https://`), and the
three secrets. Generate each one separately:

```bash
openssl rand -hex 32
```

`TZ` defaults to `Europe/London`; override it in `.env` if your users are somewhere else (e.g.
`America/New_York`). Lighting Automations store the wall-clock time you pick in the browser with
no timezone attached, so if this doesn't match where your users actually are, automations will
fire at the wrong hour (looking, from a clock-watcher's perspective, like they never fire at all).

## 5. Build and start everything

```bash
docker compose up -d --build
```

First build takes a few minutes (installs deps, compiles the client and server, pulls
`postgres:16-alpine` and `caddy:2-alpine`). Watch progress with:

```bash
docker compose logs -f
```

The `server` container runs `prisma migrate deploy` automatically on every boot — the schema
will be created on this first run.

## 6. Seed the initial admin account

```bash
docker compose exec server npx tsx prisma/seed.ts
```

This prints the seeded Super Admin email and a one-time temporary password — copy it now, it
won't be shown again. Log in and change the password (the app forces this on first login).

## 7. Verify

Visit `https://your-domain.com`. Caddy issues the certificate on first request to that domain,
so the very first load may take a couple of extra seconds. Check `docker compose ps` — all
three services should show healthy/running.

## Updating after a code change

```bash
git pull
docker compose up -d --build
```

Compose only rebuilds the images whose source changed; Postgres data and Caddy's certificates
persist in named volumes across this.

## Backups

The two volumes that matter are `postgres_data` (the database) and `server_uploads` (branding
images, avatars, asset photos). A simple periodic dump:

```bash
docker compose exec postgres pg_dump -U kynren kynren_asset_register > backup-$(date +%F).sql
```

## Troubleshooting

- **Certificate not issuing**: confirm DNS actually resolves to this VPS (`dig your-domain.com`)
  and that ports 80/443 are open in Hostinger's firewall/VPS panel, not just the OS firewall.
- **500s from the app but containers are up**: `docker compose logs server` — most often a
  missing/blank required env var (the compose file fails fast with a clear message for the
  required ones).
- **NVR/camera live view not working**: the server image includes `ffmpeg`; if it's still
  failing, check `docker compose logs server` for the actual RTSP connection error — it's
  usually the camera being unreachable from the VPS's network, not a missing dependency.
