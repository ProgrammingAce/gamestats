# GameStats — TODO

Improvements identified by reviewing the codebase against DESIGN.md.

---

## Critical Bugs

- [x] **Duplicate SSE handler in server/index.js** — Removed duplicate handler from index.js
- [x] **configFileService.js validatePath uses `await` in non-async function** — `validatePath()` is now async but `await validatePath()` on line 63 is inside a `.forEach()` callback that isn't async. The `await` is ineffective. Fix: replace `.forEach()` with a `for...of` loop so `await` works inside the already-async `loadConfigFile`.
- [x] **SSE event format mismatch between server and client** — Changed client to use `addEventListener` for named SSE events

## High Priority

- [x] **Auto-scan on first open** — Server now auto-triggers a scan on first SSE connection when no scan has run yet
- [x] **`/api/open` path safety validation** — Added path validation against known scan locations (from scan results and custom folder list). Only paths within known scan locations are now allowed.
- [x] **`/api/open` cross-platform support** — Added platform detection: `open` (macOS), `xdg-open` (Linux), `explorer.exe` (Windows).

## Medium Priority

- [x] **Missing `--config <path>` CLI flag** — Added `--config <path>` flag to `bin/gamestats.js` that accepts a path to a custom `gamestats.config.json` file
- [x] **Settings path should use `%APPDATA%` on Windows** — `settingsService.js` now detects Windows and uses `%APPDATA%\gamestats\settings.json` with `~/.gamestats/` as fallback.
- [x] **GOG Galaxy additional library paths** — `scanners/gog.js` now checks `%LOCALAPPDATA%\GOG.com\Galaxy\Configuration\` for JSON config files that contain `library_paths` arrays, adding those paths to the scan
- [x] **Xbox scanner WindowsApps note** — DESIGN.md says to skip `WindowsApps` and note the limitation in the UI. Current implementation silently ignores this.
- [x] **Rank column sort** — `public/app.js` now handles rank by sorting by size descending

## Low Priority

- [x] **customFolder.js `.name` access on string** — Added type checking to handle both string paths and `{path, name}` objects
- [x] **No tests** — Added vitest.config.js and test files for: steam scanner, epic scanner, directory size calculator, scan orchestrator
- [x] **No vitest config** — Added `vitest.config.js` with proper configuration (globals, environment, include patterns)

## New Issues (found during review)

- [x] **Double `listen` call** — `server/index.js:45` calls `app.listen()` and then `bin/gamestats.js:60` calls `server.listen()` again on the same server object. Removed duplicate from bin/gamestats.js
- [x] **Missing middleware in server/index.js** — Added `express.json()` and `express.static()` middleware
- [x] **Duplicate `complete` SSE event** — Removed `complete` event from orchestrator, now returns `{ games, notes }`. Route's `completeScan` sends single `complete` with `notes` from orchestrator + `durationMs`
- [x] **`getCustomPaths` not exported from server/index.js** — `routes/open.js` now imports `getCustomPaths` from `settingsService.js` directly
- [x] **Xbox `notes` return format breaks scanner interface** — `xbox.js` returns `{ games, notes }` instead of a plain `GameEntry[]` array. The orchestrator handles both formats (scanOrchestrator.js:36-37), but the `notes` from the auto-scan path in `scan.js:42` are not included since that `complete` event is built manually without them.

## Architecture / Security

- [x] **SSE flow doesn't match DESIGN.md** — `POST /api/scan` now broadcasts to `activeSses` connections opened via `GET /api/scan`. POST returns `202 Accepted` with `{ status: "started" }` and SSE events stream through the GET connection.
- [x] **`POST /api/scan` should return `202 Accepted`** — Now sends `202 Accepted` with `{ "status": "started" }` immediately before starting the scan
- [x] **XSS via innerHTML in app.js** — Applied `escapeHtml()` to all `data-path` attributes in `renderTable()` (line 184) and `renderFolders()` (line 55)
- [x] **Circular imports between index.js and routes** — Created `services/sharedState.js` to hold shared state (`scanResults`, `customConfigPath`) and functions (`updateScanResults`, `isPathWithinKnownLocations`, `normalizePath`, `setCustomConfigPath`, `getCustomConfigPath`). All imports now reference the service file, eliminating circular dependencies.

## Polish / Nice-to-Have

- [x] **Empty state message** — DESIGN.md specifies showing "No games found. Try adding a custom scan folder." when scan returns zero results.
- [x] **Scan duration in status bar** — Added timestamp display showing `Last scan: MM-DD-YYYY HH:MM` after scan completes
- [x] **Port-in-use error message** — Added error handler for EADDRINUSE that shows clear message suggesting `--port` flag
