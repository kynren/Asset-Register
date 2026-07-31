# Kynren Asset Register — Update Log & Reference

This document records everything built so far across two work sessions, for reference in future
conversations. It covers the initial full-stack build and a large second round of feature
additions (password vault, personalization, dashboard widgets, asset inventory redesign, etc.).

Corrected note: the requested path was `.clade/docs/` — this doc lives at `.claude/docs/README.md`,
matching the project's actual `.claude/` config directory (see `.claude/launch.json`).

---

## 1. Stack & Architecture

- **Client**: React 19 + Vite + TypeScript, React Router v7, TanStack Query + Table, Recharts,
  React Flow (`@xyflow/react`), `@dnd-kit` (drag-and-drop), `qrcode`.
- **Server**: Node.js + Express + TypeScript, Prisma ORM, PostgreSQL, JWT auth (access token +
  httpOnly refresh cookie), Zod validation, Multer for uploads.
- **Database**: a **dedicated local PostgreSQL 16 instance on port 5433**, installed specifically
  for this app. It is intentionally separate from another PostgreSQL instance already running on
  this machine on port 5432, which belongs to **HikCentral Access Control** (Hikvision) —
  that instance must never be touched.
- **Agent**: standalone Python script (`agent/`) that reports device info (hostname, IP, MAC, OS,
  hardware) from client PCs to the API — browsers can't read this info directly, hence the agent.
- **Monorepo layout**: `client/`, `server/`, `agent/`, npm workspaces at the root.

---

## 2. Round 1 — Initial Full Build

Built the whole application from scratch: auth + RBAC, all 11 sidebar modules, and the device
agent.

### Auth & RBAC
- JWT access token + refresh cookie, forced password change on first login.
- DB-driven roles/permissions (`Role`, `RolePermission`) — editable live from the UI, no redeploy
  needed. Seeded roles: Super Admin, Admin, IT Technician, Helpdesk Agent, Stock Manager, Viewer.
- Permission model is per-module (`dashboard`, `assets`, `network`, `stock`, `helpdesk`,
  `operations`, `nvr`, `virtual-assistant`, `admin`) × per-action (view/create/edit/delete/export).

### System Console modules
- **Dashboard**: KPI cards, asset/ticket status charts, recent activity.
- **Asset Inventory**: full CRUD, categories/locations, CSV import/export, asset detail page with
  linked device + ticket history.
- **Network Topology Map**: graph of devices (via React Flow), manually addable infrastructure
  nodes (routers/switches/NVRs).
- **Stock Register & Analytics**: items, IN/OUT transactions, low-stock alerts, consumption charts.
- **Helpdesk & Ticketing**: tickets, comments, status workflow, asset linkage.
- **Operations Tools**: bulk asset status updates, CSV/PDF report generator, maintenance-due list.
- **NVRs & Cameras**: registry + camera grid with stream embedding.
- **Virtual Assistant**: local rule-based (non-LLM) Q&A engine over the app's own data — no
  external API key/cost.

### Settings
- **Profile**, **Admin & Setup** (users, roles, categories/locations, system settings, audit log),
  **Password Management** (account password change).

### Device Agent (`agent/kynren_agent.py`)
Python script using `psutil`, `getmac`, `platform`, and (Windows only) `wmi`/`pywin32` for
hardware info. Posts to `POST /api/agent/devices` with an `X-Agent-Key` header. Can be scheduled
via `agent/install_task.ps1` (Windows Task Scheduler).

---

## 3. Round 2 — Password Manager, Personalization, Dashboard Widgets, Asset Inventory Redesign

This round added the following, in response to a follow-up request.

### 3.1 Password Vault (`Password Management` tab)
A personal password manager, separate from the account-password form, modeled loosely on Google
Password Manager:
- New `VaultEntry` model (title, website, username, `encryptedPassword`, notes), scoped per-user.
- **Encrypted with AES-128-GCM specifically** (`encryptVaultSecret`/`decryptVaultSecret` in
  `server/src/lib/crypto.ts`), as explicitly requested — this is separate from the AES-256-GCM
  helper already used for NVR/camera credentials in the same file.
- `POST /api/vault/:id/reveal` decrypts server-side and returns plaintext once, audit-logged
  (`vault.reveal`). The list endpoint never returns the password.
- Client-side "crypto" reveal/hide animation: `client/src/hooks/useCryptoReveal.ts` scrambles
  random characters and progressively locks in the real characters left-to-right when revealing
  ("decrypting"), and reverses the effect back to dots when hiding ("encrypting").
- UI: `client/src/pages/password/VaultTab.tsx`, `VaultEntryRow.tsx`, `VaultEntryModal.tsx`.

### 3.2 Admin & Setup → User Detail Page
Clicking a user in **Admin & Setup → Users** now navigates to `/admin/users/:id`
(`client/src/pages/admin/UserDetailPage.tsx`) instead of a small inline modal:
- Edit first/last name and role, save.
- "Set Temporary Password" (server-generates via the existing crypto-secure `generateTempPassword`
  helper) and Activate/Deactivate.
- **Linked Devices**: assets assigned to that user, joined with their agent-reported `Device` info
  — new endpoint `GET /api/users/:id/devices`.
- Personal audit trail (reuses `GET /api/audit?userId=`).

### 3.3 System Settings → Branding (app icon & favicon)
- `POST /api/settings/branding` (multer disk storage → `server/uploads/branding/`, public static
  route, 2MB limit, image-mimetype filter) stores the URL in `SystemSetting` (`appIconUrl` /
  `faviconUrl`).
- New public endpoint `GET /api/settings/public` (no auth) returns `{companyName, appIconUrl,
  faviconUrl}` so the login screen and browser tab can pick it up before login.
- `client/src/theme/BrandingContext.tsx` fetches this on load, sets `document.title` and the
  `<link rel="icon">` dynamically, and feeds the sidebar brand mark + login page logo.

### 3.4 Profile Page Overhaul
`client/src/pages/profile/ProfilePage.tsx` (+ `AvatarGallery.tsx`, `ColorPaletteCard.tsx`):
- Avatar upload with a **photo gallery** (`UserImage` model — multiple uploaded photos, click one
  to set it as the active avatar; delete unwanted ones).
- **Accent color palette** — `User.accentColor` (hex), 8 preset swatches + Reset. Applied live
  app-wide via `client/src/lib/color.ts` (`applyAccentColor`), which overrides the
  `--color-primary` / `--color-primary-hover` / `--color-primary-soft` CSS variables on
  `document.documentElement` whenever the logged-in user's `accentColor` is set (wired into
  `AuthContext`). Verified: switching color re-themes sidebar highlights, buttons, and the
  floating assistant button instantly.
- Password change embedded directly on the page (in addition to the standalone Password
  Management page).
- **My Devices** (assets/devices linked to the current user, `GET /api/profile/devices`) and a
  paginated **My Activity** feed.
- Every field auto-saves via `PATCH /api/profile` as soon as it's changed (avatar click, color
  click); name fields use an explicit "Save Changes" button.

### 3.5 Floating Virtual Assistant
`client/src/layout/FloatingAssistant.tsx` — a chat-bubble FAB fixed bottom-right on every
authenticated page (mounted in `AppShell`), respects the `virtual-assistant` view permission.
Opens a compact popover chat reusing `POST /api/assistant/query`; a shortcut button jumps to the
full `/assistant` page.

### 3.6 Dashboard: Drag-and-Drop Widget Grid
Complete rebuild of `client/src/pages/dashboard/DashboardPage.tsx`:
- Widget catalog (`client/src/pages/dashboard/widgets.tsx`): 4 KPI cards, 2 charts, Recent
  Activity, and three "extra" widgets (Low Stock Items, Offline Devices, Maintenance Due) that can
  be added on demand.
- Drag-to-reorder via `@dnd-kit` (`SortableWidget.tsx`, `rectSortingStrategy`).
- Expand/collapse toggle per widget (cycles between its default column span and full width).
- **Add Widget** modal (`AddWidgetModal.tsx`) lists only catalog widgets not already on the
  dashboard.
- Layout (widget order + size) persists per-user via new `DashboardLayout` model,
  `GET`/`PUT /api/dashboard/layout`.
- **Recent Activity is now a real paginated table**, page size 5, backed by a dedicated
  `GET /api/dashboard/activity` endpoint (previously it was an unpaginated top-15 list embedded in
  the summary endpoint).

### 3.7 App-Wide Pagination Sweep
`client/src/components/DataTable.tsx` gained a **client-side pagination fallback**: pass
`clientPageSize` instead of `page`/`totalPages`/`onPageChange` and it paginates the given array
in-browser. Applied to: Asset Categories / Locations / Ticket Categories manager lists (Admin),
NVR Event Log, Agent API Keys list, IP Range Scanner results + scan history, and the Asset Detail
ticket-history table. Large collections (Assets, Tickets, Stock, Users, Devices, Audit Log) already
used real server-side pagination from Round 1 and are unchanged.

### 3.8 Network Topology Map: MAC Vendor + Device Type
`server/src/lib/macVendor.ts` — an embedded (curated, non-exhaustive) OUI-prefix → vendor table
covering common manufacturers (Dell, HP, Apple, Cisco, TP-Link, Hikvision, Dahua, Raspberry Pi,
VMware, etc.), used first. **(Updated 2026-07-31)** When a scanned MAC's prefix isn't in that local
table, `lookupVendorOnline()` falls back to the free api.macvendors.com lookup — calls are
serialized through a single module-level queue (≥1.1s apart, respecting that API's ~1 req/sec
unauthenticated limit) and cached by OUI prefix, and the whole thing fails soft (timeout + catch)
so a slow/unreachable API never blocks a scan.

`guessDeviceType()` classifies vendor + open ports into a broader taxonomy: **Computer**,
**Network Switching / Routing** (merges what used to be split "switch" vs "router" signal — a
single label so the Switching tab surfaces both), **Raspberry Pi**, **IoT Device**, **Lighting**,
**Sound System**, plus the existing IP Camera / NVR, Printer, Virtual Machine, Networked Device,
and Unclassified Device. Matching is by lowercase substring against the vendor string (not exact
equality) since the online fallback returns full IEEE-registered legal names (e.g. "Sonos, Inc.")
that wouldn't exact-match the short curated names.

Applied in `scan.service.ts` (IP Range Scanner results show Vendor + Device Type columns) and
carried through when a discovered host is "promoted" to the Topology Graph
(`NetworkScanResult`/`NetworkNode` both have `vendor`/`deviceType` columns). **Any alive discovered
host can now be adopted directly into Asset Inventory** from the IP Range Scanner (`Adopt into
Inventory` button next to `Add to Topology`, gated on `assets:create`) — opens the standard
`AssetFormModal` prefilled from the scan result (name/manufacturer/notes/`staticIpAddress`), with a
best-effort category guess from the detected device type (using the `isComputerAsset`/
`isSwitchingDevice` category flags where they apply, else a loose name match). The Switching tab's
"Discovered on Network" list filters on the renamed `"Network Switching / Routing"` label.

### 3.8a Network Topology Map: Continuous Monitoring (Domotz-style) — added 2026-07-31
A sixth Network Topology Map tab, **Monitoring** (`client/src/pages/network/MonitoringTab.tsx`),
adds background monitoring distinct from the on-demand IP Range Scanner: `NetworkMonitorSettings`
(singleton row, `id=1`) holds `enabled`, `intervalMinutes`, and `ranges` (JSON array of
`{startIp,endIp,label?}`). `server/src/lib/networkMonitor.ts`'s `startNetworkMonitorScheduler()`
ticks every 60s (wired into `server/src/index.ts` alongside the other schedulers) but only actually
runs a cycle once `intervalMinutes` has elapsed since `lastRunAt` — unlike the fixed-hours
`setInterval` schedulers elsewhere in this codebase, this interval is admin-configurable at runtime
via the UI, so it's re-checked against the DB every tick rather than baked into the `setInterval`
call.

Each cycle (`runNetworkMonitorCycle()`) calls a new `runScheduledScan()` in `scan.service.ts` — like
`startScan()` but **awaited synchronously** (the scheduler isn't on a request/response cycle) and
tagged `triggeredBy: "SCHEDULED"` with `startedById: null` (`NetworkScan.startedById` was relaxed to
nullable for this). Results are diffed against `MonitoredNetworkDevice` (keyed by MAC when known,
else `ip:<address>` — stable across a scan's own IP churn): a device's `status` only flips, and only
then does it log a `NetworkDeviceStatusEvent` row and fire a notification — a device staying online
or offline across cycles never re-alerts. Alerts go through the same `notifyUsers()`/event-email
pattern as `maintenanceAlerts.ts`/`overdueTaskAlerts.ts`, to everyone with `network:canEdit`, via two
new `EmailEventType` values: `DEVICE_OFFLINE` / `DEVICE_ONLINE`.

Optional per-device SNMP polling (`server/src/lib/snmp.ts`, using the `net-snmp` package) walks
standard MIB-II OIDs only — `sysDescr`, `sysUpTime`, and `ifTable` (name/admin+oper status/speed/
octets) — deliberately no vendor-specific MIBs. The community string is encrypted at rest via the
existing `encryptSecret()`/`decryptSecret()` (`server/src/lib/crypto.ts`, same AES-256-GCM helper as
NVR/camera credentials) and is never returned to the client (`shapeMonitoredDevice()` in
`network.routes.ts` strips it, exposing only a `snmpConfigured` boolean). A poll failure (timeout,
wrong community, device doesn't speak SNMP) is fully soft — it sets `snmpLastError` and shows an
"Error" badge in the UI rather than aborting the rest of the cycle. New routes, all under
`/api/network/monitor/*`: `GET`/`PUT /settings`, `POST /run-now` (fire-and-forget, 202, since a full
cycle across every configured range can take tens of seconds — the client polls `GET /devices`
afterward), `GET /devices`, `POST /devices/:id/snmp`.

### 3.9 Layout Fix — Only Content Scrolls
`.app-shell` and `.main-area` are now `height: 100vh; overflow: hidden`; `.page-content` is the
only scrollable region (`overflow-y: auto`). The sidebar and top bar no longer move when scrolling
a long page (previously they used `position: sticky`, which was visually similar but not what was
asked for).

### 3.10 Asset Inventory Redesign
Rebuilt `client/src/pages/assets/AssetListPage.tsx` to match a reference screenshot's layout and
functionality — **kept the app's existing light/dark design system rather than the screenshot's
neon-terminal skin**, to stay visually consistent with the rest of the app (flagged as a judgment
call; can be revisited if a literal reskin is wanted):
- **Category tabs with live counts** ("All Assets", each `AssetCategory`, "+ Add Asset Type"
  shortcut into Admin), backed by new `GET /api/assets/stats`.
- **Advanced filter bar**: search, status, custodian (assignee), created-date range — new
  `assignedToId`/`dateFrom`/`dateTo` query params on `GET /api/assets`.
- **Bulk selection**: header + row checkboxes, bulk "Apply Status" action bar.
- **Inline-editable Status and Custodian** dropdowns directly in the table (no modal needed for
  quick changes) — gated behind the `assets:edit` permission.
- **Sign-off badge**: new `Asset.signOffStatus` enum (`PENDING`/`CONFIRMED`), click-to-toggle.
- **List/Grid view toggle** (`AssetGridCard.tsx` for the card layout).
- **Print Inventory** (browser print, scoped via `#inventory-print-area` + `@media print` rules in
  `global.css`), **Export JSON** (new `GET /api/assets/export.json`) alongside the existing CSV
  export/import, **Duplicate** asset (`POST /api/assets/:id/duplicate`), **Copy share link**, and
  **QR label printing** — `QrLabelModal.tsx` generates a real scannable QR code client-side via the
  `qrcode` package (encodes the asset tag), printable via the same `@media print` mechanism.
- Deliberately did **not** fabricate a telemetry sparkline/uptime-graph column like the reference
  image, since we don't collect real time-series telemetry — only a simple Online/Offline +
  last-seen indicator is shown, sourced from the real agent-reported `Device.lastSeen`.

---

## 4. Bugs Found & Fixed During This Work

- **Zod `.optional()` vs `null`**: several forms (NVR/camera port fields, stock item unit cost)
  sent explicit `null` for empty optional numeric fields, but the Zod schemas only had
  `.optional()` (which allows `undefined`, not `null`). Fixed by adding `.nullable()` to those
  fields in `nvr.schema.ts` and `stock.schema.ts`. The asset schema already had this right from
  Round 1 (`.nullable().optional()`), which is why it worked without a fix.
- Removed a leftover client-side `Math.random()`-based password generator in `UsersTab.tsx` in
  favor of the server's crypto-secure `generateTempPassword()`, returned from
  `POST /api/users/:id/reset-password`.

---

## 5. Environment Notes (for future sessions)

- **Two PostgreSQL instances on this machine**: port 5432 belongs to HikCentral Access Control
  (Hikvision) — do not touch. Port 5433 is this app's dedicated instance
  (`kynren_asset_register` database).
- `server/.env` and `agent/.env` hold local secrets (DB password, JWT secrets, `ENCRYPTION_KEY`
  used for both AES-256 NVR credentials and AES-128 vault entries, agent API keys) — git-ignored,
  not committed.
- Seeded admin login: `subscriptions@kynren.com`. The password has been rotated a couple of times
  during testing (forced first-login change, then an admin-triggered reset) — if you don't have
  the current one, use **Admin & Setup → Users → Reset Password** while logged in, or re-run
  `npm run db:seed` against a fresh database to get a new seeded temp password printed to the
  console. The actual current password is intentionally not recorded in this file.
- Dev servers: `npm run dev` from the repo root runs both client (`:5173`) and server (`:4000`)
  together; Vite proxies `/api` and `/uploads` to the server (see `client/vite.config.ts`).
- Multer/react-router had known advisories flagged by `npm audit`; multer was upgraded to 2.x
  (fixed), and the react-router advisory is about RSC/framework mode, which this app doesn't use
  (plain `BrowserRouter` SPA) — left as-is, noted here so it isn't re-investigated from scratch.

---

## 6. Quick File Map (Round 2 additions)

| Area | Key files |
|---|---|
| Vault crypto | `server/src/lib/crypto.ts` (`encryptVaultSecret`/`decryptVaultSecret`) |
| Vault API | `server/src/modules/vault/vault.routes.ts`, `vault.schema.ts` |
| Vault UI | `client/src/pages/password/VaultTab.tsx`, `VaultEntryRow.tsx`, `VaultEntryModal.tsx` |
| Reveal animation | `client/src/hooks/useCryptoReveal.ts` |
| User detail page | `client/src/pages/admin/UserDetailPage.tsx`, `server/src/modules/users/users.controller.ts` (`devices`) |
| Branding | `server/src/modules/settings/settings.routes.ts`, `settingsPublic.routes.ts`, `client/src/theme/BrandingContext.tsx` |
| Profile overhaul | `client/src/pages/profile/ProfilePage.tsx`, `AvatarGallery.tsx`, `ColorPaletteCard.tsx`, `server/src/modules/profile/profile.routes.ts` |
| Accent color | `client/src/lib/color.ts`, wired in `client/src/auth/AuthContext.tsx` |
| Floating assistant | `client/src/layout/FloatingAssistant.tsx` |
| Dashboard widgets | `client/src/pages/dashboard/{DashboardPage,widgets,SortableWidget,AddWidgetModal}.tsx`, `server/src/modules/dashboard/dashboard.routes.ts` (`/activity`, `/layout`) |
| Pagination fallback | `client/src/components/DataTable.tsx` (`clientPageSize` prop) |
| MAC vendor lookup | `server/src/lib/macVendor.ts`, used in `server/src/modules/network/scan.service.ts` |
| Layout scroll fix | `client/src/styles/global.css` (`.app-shell`, `.page-content`), `client/src/styles/layout.css` (`.topbar`) |
| Asset Inventory redesign | `client/src/pages/assets/AssetListPage.tsx`, `AssetGridCard.tsx`, `QrLabelModal.tsx`, `server/src/modules/assets/assets.controller.ts` (`stats`, `exportJson`, `duplicate`) |
| Schema changes | `server/prisma/schema.prisma` — `VaultEntry`, `UserImage`, `DashboardLayout`, `User.accentColor`, `Asset.signOffStatus`, `NetworkNode`/`NetworkScanResult.vendor`/`deviceType` |
