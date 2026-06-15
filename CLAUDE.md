# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Gestor de Enlaces" is a bookmarks manager with three views: bookmarks (by category), server health monitoring, and an MCP catalog browser. UI strings are in Spanish; code identifiers are in English. The backend (Express + SQLite) also serves the React frontend in production.

## Commands

There is no root `package.json` — backend and frontend are independent npm projects.

**Backend** (`cd backend`):
- `npm run dev` — run server with nodemon reload (port 5000)
- `npm start` — run server (production)
- `npm run build` — builds the frontend (`cd ../frontend && npm install && npm run build`)

**Frontend** (`cd frontend`):
- `npm start` — CRA dev server on port 3000, proxies `/api` to `localhost:5000` (see `proxy` in `frontend/package.json`)
- `npm run build` — production build into `frontend/build`
- `npm test` — react-scripts test runner (note: no test files exist in the repo yet)

**Deploy:** `pm2 start ecosystem.config.js` (process name `gestor`, runs `backend/server.js`).

Dev workflow runs backend and frontend in two terminals. For a single-process run, start only the backend — `server.js` auto-runs `npm run build` if `frontend/build/index.html` is missing, then serves the build and falls back to `index.html` for all non-`/api` routes.

## Architecture

**Single shared SQLite database.** `backend/server.js` opens `backend/bookmarks.db` and passes the `db` handle into every module. The core server owns the `bookmarks` table; each module creates and owns its own tables on the same connection.

**Backend module system.** On startup, `loadModules()` scans `backend/modules/*/index.js` and calls `moduleExports.initialize(app, db)` on each. A module:
- receives the Express `app` and the shared `db`
- creates its tables, seeds them, and registers its own routes inside `initialize`
- optionally exports `exports.routes` (metadata array surfaced at `GET /api/modules`)

To add a backend feature as a module, create `backend/modules/<name>/index.js` exporting `initialize` — it is auto-discovered, no registration needed. `health` is the reference example.

**JSON seeding pattern.** Tables seed from JSON only when empty (count === 0):
- `bookmarks` ← `json/bookmarks.json` (in `server.js`)
- `servers` ← `json/servers.json` (in the health module, path resolved up three levels from the module)

`GET /api/export` writes the live `bookmarks` table back to `json/bookmarks.json`.

**Tracked vs. runtime data files (important).** `.gitignore` excludes the runtime files `json/bookmarks.json`, `json/servers.json`, the whole `mcp-list/` directory, `backend/bookmarks.db`, and `frontend/build`. Only the `*.base.json` templates (`json/bookmarks.base.json`, `json/servers.base.json`) are committed. The runtime `.json` files are local working copies derived from the `.base.json` templates — when changing seed data, edit the committed `.base.json` and copy it to the runtime name locally. Do not expect `mcp-list/` contents or the DB to be in git.

**Frontend.** Create-React-App. `src/App.js` holds all top-level state and switches between the three views via a `currentView` string (no router). Components live in `src/components/` (`CategoryNav`, `BookmarkList`, `ServerHealth`, `McpList`), each with a sibling `.css`. `src/api.js` centralizes axios calls, but `App.js` and some components also call `axios` directly against `/api/...` — match whichever pattern the file already uses. Icons come from FontAwesome.

**Health module specifics** (`backend/modules/health/index.js`):
- `GET /api/health/check` fetches each server's URL (axios, 5s timeout) and treats HTTP 200 as `ok`; it reads a `components` object from the response body to report per-component status.
- On error states it fires an OS notification, rate-limited per server to once per 300s (`lastNotificationTimes`).
- Notifications use Windows toast via a PowerShell command, `notify-send` on Linux, and fall back to `console.log` otherwise. `backend/test-notification.js` is a standalone script to test the Windows toast.

**MCP catalog** (routes in `server.js`): reads `mcp-list/data.json` for the list, and serves per-folder `readme.md` / file listings / downloads from `mcp-list/<folder>/`. File downloads are path-guarded to stay within the requested folder.

## Conventions

- Endpoints respond with `{ error: message }` and an appropriate HTTP status on failure; success returns the affected row(s) or a `{ message }` confirmation.
- Bookmark required fields: `category`, `short_description`, `link`. Server required fields: `name` (unique), `url`.
- Requires Node 18+. Native OS notifications are Windows-only (others fall back to console).
