# Kynren Asset Register

A full-stack asset management system for Kynren: IT/physical asset inventory,
role-based access control, network topology mapping (populated by a device
agent), stock register, helpdesk ticketing, operations tools, NVR/camera
registry, and a local virtual assistant.

## Stack

- **Client**: React 19 + Vite + TypeScript, React Router, TanStack Query/Table, Recharts, React Flow
- **Server**: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL, JWT auth
- **Agent**: standalone Python script, reports device info from client PCs
- **Database**: a dedicated local PostgreSQL 16 instance on port **5433**
  (kept separate from the pre-existing HikCentral Access Control PostgreSQL
  instance on port 5432 — do not point this app at that instance)

## Project layout

```
client/    React SPA
server/    Express API + Prisma schema/migrations/seed
agent/     Python device agent (see agent/README.md)
```

## First-time setup

1. **Database**: PostgreSQL 16 is already installed and running on port 5433
   with a database named `kynren_asset_register`. Connection details are in
   `server/.env` (already created for local dev — not committed to version control).

2. **Install dependencies** (from the repo root):
   ```bash
   npm install
   ```

3. **Apply the schema** (already done for this environment, safe to re-run):
   ```bash
   npm run db:migrate
   ```

4. **Seed roles, the default admin user, categories, locations, and an agent
   API key** (already done for this environment — re-running will not reset
   the admin password or duplicate seed data):
   ```bash
   npm run db:seed
   ```
   The first run prints a temporary admin password and an agent API key to
   the console — save the agent API key into `agent/.env` if you plan to run
   the device agent.

5. **Run both client and server together**:
   ```bash
   npm run dev
   ```
   - API: http://localhost:4000
   - Client: http://localhost:5173 (proxies `/api` to the server)

6. Log in with the seeded admin account (`subscriptions@kynren.com`). You'll
   be required to set a new password on first login.

## Roles seeded

Super Admin, Admin, IT Technician, Helpdesk Agent, Stock Manager, Viewer —
each with a starting permission matrix editable under **Admin & Setup →
Roles & Permissions**. Permissions are per-module (Dashboard, Assets,
Network, Stock, Helpdesk, Operations, NVR, Virtual Assistant, Admin) and
per-action (View/Create/Edit/Delete/Export), and take effect immediately —
no redeploy needed.

## Device agent

See [`agent/README.md`](agent/README.md). In short: install Python, `pip
install -r agent/requirements.txt`, configure `agent/.env` with the API URL
and an agent key generated from **Admin & Setup → System Settings**, then run
`python kynren_agent.py` (or schedule it with `agent/install_task.ps1`).
Reported devices appear under **Network Topology Map → Devices** and can be
linked to an asset record.

## Useful scripts (from repo root)

| Command | Description |
|---|---|
| `npm run dev` | Run client + server together |
| `npm run build` | Production build of both |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed roles/admin user/categories/locations |
| `npm run db:studio` | Open Prisma Studio to browse the database |

## Notes on this environment

- This machine also runs a **separate** PostgreSQL instance belonging to
  HikCentral Access Control (port 5432) — that instance and its databases are
  untouched by this app. Do not repoint `DATABASE_URL` at port 5432.
- `server/.env` and `agent/.env` are git-ignored — they contain local secrets
  (DB password, JWT signing secrets, agent API keys) and should not be committed.
