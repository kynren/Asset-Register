# Kynren Asset Register — Desktop

A thin native shell around the existing web app. It does **not** embed the server, the database,
or a copy of the client — it just opens a dedicated, branded window and points it at your hosted
deployment (e.g. `https://app-assets.kynren.com`), the same way a browser tab would. Every
feature works exactly as it does in the browser, because it *is* the browser (Chromium, via
Electron) — nothing here re-implements app logic.

## Why a desktop shell instead of a full offline app

This app is multi-user (roles, RBAC) with everyone sharing one server and database, so the
desktop build stays a wrapper rather than bundling its own server/DB per install — that would
fragment who sees what. If that ever needs to change, it's a separate, bigger project.

## First run

On first launch (or if no server URL is saved yet), the app asks for your deployment's URL —
the same address you'd type into a browser. It's saved locally (via `electron-store`, under your
OS's app-data folder) and reused on every subsequent launch. Change it any time from
**File → Change Server URL...**.

## Development

```bash
cd desktop
npm install
npm run dev
```

This runs the Electron app unpacked, using whatever server URL you enter (point it at
`http://localhost:5173` to test against a local `npm run dev` from the repo root).

## Building installers

```bash
npm run build:win     # NSIS installer (.exe)
npm run build:mac     # .dmg — must run on macOS
npm run build:linux   # AppImage + .deb
```

Cross-building a working `.dmg` from Windows or Linux isn't reliable — build the macOS target on
an actual Mac, or use the `.github/workflows/desktop-build.yml` CI workflow, which builds all
three platforms on their native runners and uploads the installers as build artifacts.

The unsigned macOS build will trigger Gatekeeper's "unidentified developer" warning on first
open (right-click → Open bypasses it). Code-signing and notarization need an Apple Developer
account and aren't set up here.

## What's in here

- `src/main.js` — window/menu management, server-URL persistence, external-link handling,
  single-instance lock, connection-failure page.
- `src/preload.js` — the *only* place with Node/IPC access, and only for the local
  settings page — the window that loads your actual server never gets a preload attached, so
  remote content stays sandboxed like a normal browser tab.
- `src/settings.html` / `src/connection-error.html` — small local pages, not part of the React
  client.
- `assets/icon.png` — app icon, generated from `client/public/favicon.svg`.
