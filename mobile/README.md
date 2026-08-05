# Kynren Asset Register — Mobile

React Native + Expo client for the Kynren Asset Register platform, talking to the same production
API the web app (`../client`) uses at `https://app-assets.kynren.com/api`. No server changes were
needed — this is the same REST API, same auth, same RBAC.

## Setup

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** (fastest way to iterate) or press `a`/`i` to launch an
Android/iOS emulator if you have one configured.

The API base URL is hardcoded in [`src/config/env.ts`](src/config/env.ts). There is currently no
dev/staging backend — every build talks to production, same as the web app.

## Architecture

- **Auth** (`src/auth/AuthContext.tsx`, `src/api/`) — mirrors `client/src/auth/AuthContext.tsx` and
  `client/src/api/axiosClient.ts`: short-lived JWT access token kept in memory, silent refresh via
  an httpOnly cookie (`POST /auth/refresh`). React Native's networking layer maintains a native
  cookie jar per host the same way a browser does, so this works without any extra libraries — no
  server changes, no token duplication in AsyncStorage.
- **RBAC** (`src/lib/permissions.ts`) — the exact same module/action list as the web app. Every
  screen should gate itself with `useAuth().hasPermission(module, action)`, same as `PermissionGate`
  does on the web.
- **Navigation** (`src/navigation/`) — bottom tabs (Home, Assets, Stock, Helpdesk, More) each
  wrapping a native-stack navigator. Modules without a bottom tab slot live in the **More** tab as a
  flat list, RBAC-filtered the same way the web sidebar is.
- **Theming** (`src/theme/`) — color tokens copied by hand from `client/src/styles/global.css`'s
  `:root` / dark-mode blocks. Follows the device's system light/dark setting; there is no
  per-user `AppearanceTheme` support yet (web-only feature for now).

## Module coverage

This is a large, incremental port — not a finished 1:1 clone yet. Screens marked "Coming soon" show
a placeholder and are what's left.

| Module | Status |
|---|---|
| Auth (password + PIN, MFA) | ✅ Built |
| Dashboard | ✅ Built |
| Notifications | ✅ Built |
| Profile (view + logout) | ✅ Built |
| Asset Inventory | ✅ Built (list/search/filter, QR scan-to-lookup, detail, create/edit) |
| Stock Register | ✅ Built (list/low-stock filter, QR scan-to-lookup, detail + history, create/edit, stock in/out) |
| Helpdesk & Ticketing | ✅ Built (list/status filter, detail + comments + status change, create) |
| Network Topology Map | ✅ Built (list-based: monitored device list, search/status filter, detail + on-demand ping) — the web app's interactive node/edge graph is not ported |
| Operations Tools | ✅ Built — subset only: IT Projects (status-filtered list + detail + status change + quick-create), Knowledge Base (search/list/detail), Asset Bookings (list/create/cancel). RSS Feed, Saved Queries, Resource Scheduling, Licenses, Timeline/Gantt, Legacy Tools are desktop-oriented and not ported |
| Controls: Lighting / Access Control | ✅ Built — Lighting (device list with on/off toggle, scene activation row), Access Control (flattened door list across all devices, remote open/close/hold/resume actions). Gates (Paxton Net2 server registration) is server setup with no field action and isn't ported |
| NVR & Cameras | ✅ Built — status-check only: flattened camera list (search, online/offline dot), detail with check-status action + recent events. Live Video Matrix (HLS), PTZ control, and Playback Center need a native video player this app doesn't have installed and aren't ported |
| Docs & SOPs | ✅ Built — read-focused: search/browse, detail view generically renders whatever `sections` shape the doc's type has (rich-text leaves shown as plain text, no WebView). Authoring (WYSIWYG editor, per-type builder, access grants, import/export, watermarking) stays web-only |
| Reports | ✅ Built — view-only: list your own + shared reports, run and view results (table rows as cards, chart data as bar list). The query builder (source/filter/column/grouping picker) and PDF/CSV export/email/share stay web-only |
| Virtual Assistant | ✅ Built — full-screen chat shell around the same POST /assistant/query pattern-matching engine the web widget uses, plus tappable quick-action chips from GET /assistant/quick-actions |
| Password Management | ✅ Built — list/search, create/edit/delete, and full reveal support: the same decrypt-on-demand flow as web, with the server-driven auto-re-encrypt timeout (GET /vault/settings) clearing the plaintext from local state after it elapses. Password is never cached in React Query, only held in local component state while revealed |
| Admin & Setup | ✅ Built — core slice only: user list/search, detail with active-toggle, role change, and reset-password (server-generated temp password shown once). Creating new accounts, the Roles/permission-matrix editor, System Settings, Backups, Email Templates, Agent Log, and the rest of the web app's Admin tabs stay web-only |
| App Settings (System Admin: org management) | ⏳ Coming soon (multi-org/System Admin surface, not applicable to most mobile users) |
| Database Manager, Media Center, Site Map, Backups | Not planned for mobile (admin/desktop-oriented tooling) |

## Building with EAS

You (not this session) run these — see the account-ownership note below.

```bash
npm install -g eas-cli   # or: npx eas-cli <command>
eas login                # your own Expo account
eas init                 # links this project to your EAS account, fills in app.json's extra.eas.projectId
```

`app.json` and `eas.json` are already configured with:
- iOS bundle ID / Android package: `com.kynren.assetregister`
- Build profiles: `development` (dev client, internal), `preview` (internal APK/ad-hoc), `production`
  (app-bundle/store-ready)
- Camera + notification permissions declared for both platforms

```bash
eas build --profile preview --platform android    # sideloadable APK to test on a real device
eas build --profile production --platform all      # store-ready builds
eas submit --platform ios                           # after filling in eas.json's submit.production.ios
eas submit --platform android                        # after adding a Google Play service-account JSON
```

**Account ownership**: this session cannot create or hold your Apple Developer Program or Google
Play Console account, and never handles your Apple/Google credentials. `eas login`, `eas init`,
`eas submit`, and filling in `eas.json`'s `submit.production` block (Apple ID, ASC app ID, Apple
Team ID, Google service-account key path) are all things you run yourself, under your own accounts.

## OTA updates (EAS Update)

`expo-updates` is installed and configured (`app.json`'s `runtimeVersion`/`updates.url`, a
`channel` per build profile in `eas.json` — `development`/`preview`/`production`). This lets you
push JS/asset-only changes (bug fixes, new screens, copy tweaks — anything that doesn't touch
native code or add a native dependency) straight to installed apps, without a new store build or
review cycle.

```bash
eas update --branch production --message "Fix vault reveal timeout"   # push to everyone on the production channel
eas update --branch preview --message "..."                            # push to internal testers
```

Users get the update the next time they fully close and reopen the app (or you can call
`Updates.checkForUpdateAsync()` / `Updates.fetchUpdateAsync()` yourself for an in-app prompt — not
currently wired up). **Native-code changes still need a new `eas build`** — installing a new
native module, bumping the Expo SDK, or editing `app.json`'s native config (permissions, icons,
plugins) all require a fresh build/submit, not just an OTA push; `runtimeVersion`'s `sdkVersion`
policy exists specifically to stop those from being served to app binaries that can't run them.

## Final pass (RBAC / push / offline / branding)

- **RBAC gating**: audited — every screen with a mutating action (create/edit/delete FABs and
  buttons) checks `hasPermission`; read-only screens are reached only through an already-gated
  `MoreScreen` entry or parent list, matching the convention already used by the pre-existing
  screens (`StockFormScreen`, `TicketFormScreen`, etc).
- **Push notifications**: fully wired. `POST /notifications/push-tokens` (registered on
  login/app-start, see `src/lib/pushNotifications.ts`) and `DELETE /notifications/push-tokens/:token`
  (called on logout) back onto the new `PushToken` Prisma model. `server/src/lib/notify.ts` fires a
  push to every in-app notification recipient via `server/src/lib/pushNotify.ts` (plain Expo push
  API call, no SDK) — push mirrors the in-app feed rather than being a separate channel.
- **Offline handling**: `src/components/OfflineBanner.tsx` (via `@react-native-community/netinfo`)
  shows a persistent top banner whenever the device has no connectivity; `axiosClient`'s error
  interceptor already handles responseless network errors safely.
- **App icon / splash / adaptive icon**: replaced with the real Kynren mark, rasterized from
  `client/public/favicon.svg` (the app's actual brand SVG) at each required size/variant — no
  longer Expo's default placeholders. `app.json`'s adaptive-icon background color was updated to
  match (`#1a0938`, a dark purple that complements the mark).
- **`extra.eas.projectId`** in `app.json` is already filled in (`eas init` was run in an earlier
  session).
