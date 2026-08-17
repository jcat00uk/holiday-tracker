# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Shiftbook is a single-file, client-side-only web app (`index.html`) for tracking shift-work bookings/leave against a rolling financial-year allocation, deployed as a static site on **Cloudflare Pages** (auto-deploys on push to `main`, no build step). There is no backend — all logic, styles, and markup live in this one HTML file.

`Tagging/` and `Plinth/` are unrelated standalone single-file tools that happen to live in this repo and are deployed alongside it (a security-list tagging tool and a fixtures/print tool respectively). They don't share code or state with the main app.

Files named `index2.html`, `indexold*.html`, `*.htmlold*`, and the `nppBackup/`/`.history/` folders are old manual snapshots/backups of `index.html`, not active code — don't edit them, and don't treat them as a source of truth for current behavior.

## Commands

There is no build, lint, or test tooling (no `package.json`). This is plain HTML/CSS/JS edited directly.

- **Run locally**: open `index.html` directly in a browser, or serve the folder with any static file server (e.g. `npx serve .`) — a real HTTP origin is needed for the Google Sign-In popup flow and service worker to work correctly (`file://` will break OAuth).
- **Deploy**: push to `main` — Cloudflare Pages auto-builds and deploys, typically live within 1-2 minutes. There is no separate staging step.
- **Verify a change is live**: check the Cloudflare Pages dashboard's Deployments tab for the commit hash, and force a cache-bypass reload (DevTools → Network → Disable cache) before testing — both the browser and Cloudflare's edge can serve stale copies briefly after deploy.

## Architecture (`index.html`)

The file is organized into clearly marked `// ═══` section banners (search for them to navigate) in roughly this order: UK holidays data → allocation table → **STATE** → time utils → break calculation → **central FY engine** → persistence → calendar/list/dashboard/alerts rendering → modal → settings → bank holidays → import/export → views → quick setup wizard → PDF report export → **Google Drive sync** → auto-sync/background sync → PWA push notifications.

### App state
All app data lives in one global mutable object `S` (`settings`, `fyAllocs`, `bankHolidays`, `bookings`), defined near the top under `// STATE`. It is persisted to `localStorage['shiftbook_v4']` via `persist()`/`loadData()` — there is no other datastore. `S._lastModified` is the dirty-tracking timestamp used both for local persistence and for deciding sync direction against Google Drive.

`updateAppState()` is the central "something changed" entrypoint — it persists, bumps `_lastModified`, and re-renders whichever view is currently active. Prefer calling it (or `refresh()` for render-only updates) rather than hand-rolling persist+re-render sequences.

### Financial year engine
All "financial year" (FY) logic is centralized in `getFinancialYearFromDate()` / `getFYKeyForDate()` under `// CENTRAL 52-WEEK FY ENGINE`. FYs are fixed 364-day (52-week) periods computed by offsetting from a hardcoded anchor date (`FY_ANCHOR`, currently 1 Mar 2026, must be a Sunday) — they are **not** calendar years, and individual FYs can have manually overridden start dates stored per-key in `S.fyAllocs`. Any date-to-FY logic should go through these functions rather than reimplementing the offset math.

### Views
The app is a single page with three switchable views (`calendar`, `list`, `dash`) toggled by `showView()`, which also guards against navigating away from unsaved Settings changes (`_settingsDirty`). Each view has its own render function (`refreshScrollCal`/`renderList`/`renderDash`) called both by `showView()` and by `updateAppState()`/`refresh()` for the currently-active view only — inactive views are not kept up to date until switched to.

### Google Drive sync
Sync is **not** Google Calendar integration — it stores the entire `S` object as one JSON file (`shiftbook-data.json`) in the signed-in user's hidden Drive `appDataFolder` (private per-app storage, isolated per OAuth Client ID — not visible in Drive UI, and not accessible via other Google API tools/clients using a different client ID). See `// GOOGLE DRIVE SYNC` (`GOOGLE_CLIENT_ID`, `GDRIVE_SCOPE = drive.appdata`).

Key pieces:
- `Sync` object holds in-memory auth/status state (`token`, `userEmail`, `fileId`); sign-in state persists across sessions via `localStorage` (`shiftbook_userEmail`, `shiftbook_hasConsented`), but `Sync.token` itself does not — it must be freshly acquired each page load via `signIn()`.
- `signIn()` uses Google Identity Services' **interactive** token flow (`prompt:''`). Do not reintroduce a silent (`prompt:'none'`) auto-refresh — it was removed because it fails to acquire a token in browsers that restrict third-party storage (Brave, Safari, hardened Chrome configs), and can fail **without ever invoking the GIS callback at all**, making it undebuggable from app code. Always require the explicit interactive popup.
- `syncNow()` compares `S._lastModified` against the Drive file's `lastModified` (2s threshold) to decide push/pull/no-op; on genuine conflicting edits it shows the conflict modal (`showConflict()` / `#conflictMbg`) rather than auto-resolving.
- `syncBackground()` is a conservative variant used on `visibilitychange`/`pagehide`/`beforeunload`: it will auto-push if local is newer, but on a real conflict it only flags `SYNC_CONFLICT_KEY` in `localStorage` for the user to resolve next time the app is open, rather than pushing/pulling silently.
- `getDriveFileId()` / `downloadFromDrive()` must treat a failed API response as an error (throw), not as "file doesn't exist" — silently treating an error as "no file" previously caused the app to create spurious empty duplicate files in the appDataFolder instead of surfacing the real failure.
- `window._debugListDriveFiles()` / `window._debugDeleteDriveFile(fileId)` are console-only diagnostic helpers (reuse the live `Sync.token`) for inspecting/cleaning up the appDataFolder directly from a signed-in browser tab — there is no other way to browse this hidden folder.

### PWA bits
`sw.js` is a minimal service worker used **only** for displaying push notifications (`message` → `showNotification`) and focusing/opening the app on notification click — it has no `fetch` handler and does not cache or intercept any requests, so it cannot be the cause of stale content after a deploy.
