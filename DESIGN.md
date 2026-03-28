# GameStats — Design Document

A local Node.js server with a browser-based UI that auto-detects installed games, measures their disk usage, and ranks them by size. The user runs a single command (`npx gamestats`) and the app opens in their default browser.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | Node.js (ES modules) | Full filesystem access, cross-platform, npm distribution |
| HTTP Server | Express | Lightweight, well-known, minimal setup |
| Frontend | Vanilla HTML/CSS/JS | No build step, no framework overhead, ships as static files served by Express |
| Real-time updates | Server-Sent Events (SSE) | One-way server-to-client push for scan progress. Simpler than WebSocket for this use case. |
| Styling | CSS with CSS variables for theming | Dark theme by default (gamers), no preprocessor needed |
| Distribution | npm package | `npx gamestats` or `npm install -g gamestats` |

---

## Architecture Overview

```
Browser (localhost:3847)              Node.js Server
┌──────────────────────┐             ┌──────────────────────┐
│  Static HTML/CSS/JS  │◄──────────► │  Express API          │
│                      │  REST +     │                      │
│  - Game list table   │  SSE        │  /api/scan    POST   │
│  - Filter/sort       │             │  /api/scan    GET SSE│
│  - Manage folders UI │             │  /api/folders GET    │
│                      │             │  /api/folders POST   │
│                      │             │  /api/folders DELETE │
│                      │             │  /api/open    POST   │
│                      │             │                      │
│                      │             │  Services:           │
│                      │             │  - Scanner modules   │
│                      │             │  - Size calculator   │
│                      │             │  - Settings manager  │
└──────────────────────┘             └──────────────────────┘
```

The server runs on `localhost` only — it never binds to `0.0.0.0`. Port `3847` by default, configurable via `--port` flag.

---

## API Endpoints

### `POST /api/scan`
Start a new scan. If a scan is already running, abort it and start fresh.
- **Request body**: none
- **Response**: `202 Accepted` with `{ "status": "started" }`

### `GET /api/scan`
SSE stream for scan progress and results.
- **Event types**:
  - `progress` — `{ "phase": "scanning", "launcher": "Steam", "gamesFound": 12 }`
  - `game` — `{ "phase": "calculating", "current": 8, "total": 24, "game": { "name": "Elden Ring", "path": "C:\\...", "launcher": "Steam", "size": 53687091200 } }` — sent as each game's size is calculated. The client appends the row to the table immediately.
  - `complete` — `{ "phase": "complete", "totalGames": 24, "totalSize": 915234578432, "durationMs": 18200 }` — signals the scan is finished. The client already has all game data from `game` events.
  - `error` — `{ "message": "..." }`

### `GET /api/folders`
Return custom scan folders from both sources, distinguished by origin.
- **Response**:
```json
{
  "settings": ["D:\\Games", "E:\\MoreGames"],
  "config": [
    "F:\\LAN-Party-Games",
    { "path": "G:\\Shared", "name": "Shared Drive" }
  ],
  "configFileFound": true
}
```
- `settings` — folders from `settings.json` (editable via UI).
- `config` — folders from `gamestats.config.json` (read-only in UI).
- `configFileFound` — whether a config file was found in the working directory.

### `POST /api/folders`
Add a custom scan folder to `settings.json`.
- **Request body**: `{ "path": "D:\\Games" }`
- **Validation**: server checks that the path exists and is a directory. Returns `400` if not.
- **Response**: `201 Created` with updated folder list

### `DELETE /api/folders`
Remove a custom scan folder from `settings.json`. Cannot remove config-file folders.
- **Request body**: `{ "path": "D:\\Games" }`
- **Response**: `200 OK` with updated folder list

### `POST /api/open`
Open a folder in the OS file explorer.
- **Request body**: `{ "path": "C:\\Steam\\steamapps\\common\\Elden Ring" }`
- **Implementation**: uses `child_process.execFile` (NOT `child_process.exec`) with platform-appropriate command (`explorer.exe` on Windows), passing the path as an argument array element. `execFile` bypasses the shell, preventing command injection via folder names containing shell metacharacters. The path is validated to exist before opening. **Only paths that are subfolders of known scan locations are allowed** — reject arbitrary paths to prevent abuse.
- **Response**: `200 OK`

---

## Core Features

### 1. Auto-Detection of Game Install Locations

On each scan, the server probes the following default locations. Each scanner is a separate module exporting a common interface so new launchers can be added easily.

#### Default Scan Sources

| Launcher | Detection Strategy |
|----------|-------------------|
| **Steam** | Read `libraryfolders.vdf` from `C:\Program Files (x86)\Steam\config\` to discover all Steam library folders. Then read each `appmanifest_*.acf` file in `steamapps/` to get game name (`"name"` field) and `installdir`. |
| **Epic Games** | Read manifest `.item` files from `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\`. Each JSON manifest contains `DisplayName` and `InstallLocation`. |
| **GOG Galaxy** | Scan `C:\Program Files (x86)\GOG Galaxy\Games\` using folder names. Also check for additional library paths in GOG Galaxy config files under `%LOCALAPPDATA%\GOG.com\Galaxy\Configuration\`. |
| **EA App** | Read config files from `C:\ProgramData\EA Desktop\InstallData\` for install paths. Fallback: scan `C:\Program Files\EA Games\` using folder names. |
| **Ubisoft Connect** | Read Windows registry via `winreg` npm package at `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs` for install paths. Fallback: scan default install directory using folder names. |
| **Xbox / MS Store** | Scan `C:\XboxGames\` using folder names. MS Store apps under `WindowsApps` are generally inaccessible — skip and note the limitation in the UI. |

#### Game Name Resolution (Priority Order)

1. **Launcher metadata** — parsed from manifest/config files as described above. This is the primary source and provides accurate display names.
2. **Folder name cleanup** — if no metadata is available (custom directories), derive the name from the folder name: replace hyphens/underscores with spaces, apply title case. Example: `dark-souls-iii` becomes `Dark Souls III`.

> **No icon fetching in v1.** Use a generic game icon per launcher. Revisit in a future version.

### 2. Custom Scan Locations

Users can add arbitrary directories to scan via the UI. These directories are scanned using folder-name-based detection (each immediate subdirectory is treated as one game).

- Add via a text input with path validation (browser folder pickers cannot return native paths — user must paste/type the path).
- Remove custom locations from the list.
- Custom locations are persisted between sessions (see Persistence section).

### 3. Game List View

The browser UI displays a ranked table of detected games, sorted by size descending (largest first).

#### Columns

| Column | Content |
|--------|---------|
| **Rank** | Position by size (1 = largest). Always reflects size ranking regardless of the current sort column. |
| **Game Name** | Resolved name (from metadata or folder) |
| **Launcher** | Source launcher name, or "Custom" for user-added paths |
| **Size** | Human-readable size (e.g., `48.3 GB`). Use binary units (GiB) with GB label per Windows convention. |
| **Install Path** | Full path, truncated with CSS `text-overflow: ellipsis`. Full path shown on hover via `title` attribute. |

#### Interactions

- **Click column header** to sort by that column (toggle ascending/descending). Default sort: size descending. Sorting is done client-side on the already-loaded data.
- **Click a row's path** to open the folder in Explorer (calls `POST /api/open`).
- **Search/filter bar** at the top to filter games by name (client-side filtering, instant).

### 4. Scanning

Scanning is triggered manually via a **"Scan Now"** button, with one exception: the app auto-triggers a scan when the browser first connects and no results exist yet (see Auto-Scan below).

#### Scan Flow

1. Client opens an SSE connection to `GET /api/scan` to receive events.
2. Client sends `POST /api/scan` to start the scan.
3. Server runs all scanners in parallel (`Promise.allSettled`), collecting game entries. Sends `progress` events per launcher.
4. Server deduplicates entries by normalized install path (case-insensitive on Windows).
5. Server calculates directory sizes sequentially. After each game's size is calculated, it sends a `game` SSE event containing the full `GameEntry` with size.
6. Client inserts each game row into the table as it arrives, maintaining the current sort order. The table builds up incrementally — users see results within seconds.
7. Server sends `complete` event (summary only — all game data was already streamed via `game` events).
8. Client finalizes the summary bar and updates the status with scan duration.

#### Size Calculation

- Use `fs.opendir` with manual recursion rather than `fs.readdir({ recursive: true })`. `opendir` returns an async iterable of `Dirent` objects and avoids buffering the entire file list in memory — important for large game folders with 200k+ files. For each file entry, call `fs.stat` to get the size and sum the results.
- Run size calculations with limited concurrency (1 at a time per physical drive) to avoid thrashing the disk. Games on different drive letters can be calculated in parallel since they are likely on separate physical disks.
- Support cancellation via `AbortController`. If a new scan is triggered, abort the current one.

#### Performance

- Scanners run in parallel (they read small metadata files — fast).
- Size calculations run sequentially (disk-bound — parallelism hurts).
- Progress updates sent every game, so the user sees incremental results.
- No caching between scans — always measure fresh.

#### Auto-Scan on First Open

When the SSE connection is established and no scan has been run in the current server session, the server automatically triggers a scan. This avoids a dead empty screen on first launch — the user sees results building immediately. Subsequent scans require clicking "Scan Now". The client shows a brief "Scanning..." state on connect rather than an empty table.

### 5. Persistence & Configuration

There are two sources of custom scan folders, merged at scan time:

#### a. App Settings (managed via UI)

Store settings in a JSON file at the platform-appropriate config directory:
- Windows: `%APPDATA%\gamestats\settings.json` (resolve via `process.env.APPDATA`)
- Fallback: `~/.gamestats/settings.json` (resolve via `os.homedir()`)

No external package needed — this is a few lines of code.

```json
{
  "customScanPaths": [
    "D:\\Games",
    "E:\\MoreGames"
  ],
  "port": 3847
}
```

These are managed through the UI's "Manage Folders" panel and the `/api/folders` endpoints.

#### b. Project Config File (optional, checked into repos / shared)

The server looks for a `gamestats.config.json` file in the **current working directory** (where the user ran the command). This allows teams or users to define scan paths alongside a project or to pre-configure the app without using the UI.

```json
{
  "scanPaths": [
    "D:\\Games",
    "F:\\LAN-Party-Games"
  ]
}
```

- If the file does not exist, it is silently ignored — not an error.
- Paths from the config file are **merged** with paths from the app settings and auto-detected launcher paths. Duplicates are deduplicated by normalized path.
- The config file is **read-only from the app's perspective** — the UI does not write to it. The "Manage Folders" panel only modifies `settings.json`.
- If the file contains malformed JSON, log a clear error with the parse error message and ignore the entire file. Do not crash.
- Validate the parsed object against an expected shape: `scanPaths` must be an array where each element is either a string or an object with a required `path` string and optional `name` string. Unexpected fields are ignored. Entries that fail validation are skipped with a per-entry warning (e.g., `"gamestats.config.json: skipping entry 3 — 'path' must be a string"`).
- Invalid paths in the config file (non-existent, not a directory) are skipped with a warning logged to the server console.
- The config file supports an optional `name` field per path for display purposes:

```json
{
  "scanPaths": [
    "D:\\Games",
    { "path": "F:\\LAN-Party-Games", "name": "LAN Party Drive" }
  ]
}
```

When a `name` is provided, the UI shows it in the Launcher column instead of "Custom".

#### Config Precedence

During a scan, custom folders are gathered from all sources and merged:

1. **Auto-detected launcher paths** — always scanned first.
2. **`gamestats.config.json`** — paths from the config file in the working directory.
3. **`settings.json`** — paths added via the UI.

All paths are deduplicated by normalized absolute path (case-insensitive on Windows) before scanning. If the same path appears in multiple sources, the first source wins for metadata (launcher name / display name).

- Scan results are **not** persisted — they are computed fresh each time.
- No scan-location data is stored beyond what the user explicitly adds (in `settings.json`) or defines in the config file.

### 6. Summary Stats

A summary bar above or below the table shows:

- **Total games found**: count
- **Total disk usage**: sum of all detected game sizes
- **Largest game**: name and size

---

## UI Layout

Dark-themed, single page. No routing needed.

```
+------------------------------------------------------------------+
|  GAMESTATS                                                        |
+------------------------------------------------------------------+
|  [Scan Now]                          [Manage Folders]            |
+------------------------------------------------------------------+
|  Total: 24 games | 847.2 GB | Largest: Call of Duty (213.4 GB)  |
+------------------------------------------------------------------+
|  Filter: [________________________]                              |
+------------------------------------------------------------------+
|  # | Game Name           | Launcher | Size     | Path            |
|----|---------------------+----------+----------+-----------------|
|  1 | Call of Duty MW III | Steam    | 213.4 GB | C:\Steam\ste... |
|  2 | Baldur's Gate 3     | Steam    | 122.1 GB | D:\Games\Bal... |
|  3 | Cyberpunk 2077      | GOG      |  68.7 GB | C:\GOG\Game... |
|  4 | Starfield           | Xbox     |  52.3 GB | C:\XboxGame... |
| ...|                     |          |          |                 |
+------------------------------------------------------------------+
|  Last scan: 2026-03-28 14:32  |  Scanning: Elden Ring (8/24)... |
+------------------------------------------------------------------+
```

### "Manage Folders" Panel

A slide-out panel or modal overlay listing custom scan paths. Contains two sections:

**User Folders** (from `settings.json`):
- A text input + **Add** button to add new paths (validated server-side).
- Each listed path has a **Remove** button.

**Config File Folders** (from `gamestats.config.json`):
- Shown in a separate read-only section, visually distinct (e.g., muted styling).
- Each entry shows the path and optional display name.
- No add/remove buttons — these are managed by editing the config file directly.
- If no config file is found, this section shows a brief hint: "Place a `gamestats.config.json` in your working directory to pre-configure scan paths."

---

## Project Structure

```
gamestats/
  package.json
  bin/
    gamestats.js              # CLI entry point: parse args, start server, open browser
  server/
    index.js                  # Express app setup, route registration
    routes/
      scan.js                 # POST /api/scan, GET /api/scan (SSE)
      folders.js              # GET/POST/DELETE /api/folders
      open.js                 # POST /api/open
    log.js                    # Thin logging utility: [gamestats HH:MM:SS] prefix
    services/
      scanOrchestrator.js     # Runs all scanners, deduplicates, calculates sizes
      directorySizeCalculator.js  # Recursive size calculation with abort support
      settingsService.js      # Load/save settings.json
      configFileService.js    # Read/validate gamestats.config.json from cwd (read-only)
    scanners/
      scanner.js              # Base interface documentation / JSDoc typedef
      steam.js
      epic.js
      gog.js
      ea.js
      ubisoft.js
      xbox.js
      customFolder.js         # Scans user-added directories
  public/
    index.html                # Single-page UI
    style.css                 # Dark theme styles
    app.js                    # Client-side logic: fetch, SSE, DOM manipulation
  test/
    scanners/
      steam.test.js
      epic.test.js
    services/
      directorySizeCalculator.test.js
      scanOrchestrator.test.js
```

---

## Scanner Interface

Each scanner module exports an object conforming to this shape:

```javascript
/**
 * @typedef {Object} GameEntry
 * @property {string} name       - Display name of the game
 * @property {string} path       - Absolute install path
 * @property {string} launcher   - Launcher name (e.g., "Steam", "Epic")
 * @property {number|null} size  - Size in bytes (null until calculated)
 */

export default {
  /** @type {string} */
  launcherName: 'Steam',

  /**
   * Returns true if this launcher is installed on the system.
   * @returns {Promise<boolean>}
   */
  async isAvailable() { /* ... */ },

  /**
   * Discover installed games. Does NOT calculate sizes.
   * @param {AbortSignal} signal
   * @returns {Promise<GameEntry[]>}
   */
  async scan(signal) { /* ... */ },
};
```

Each scanner:
1. Checks if the launcher is installed (`isAvailable()`).
2. Reads metadata files to discover game names and install paths.
3. Does **not** calculate directory sizes — that is handled by `scanOrchestrator` after all scanners report paths. This avoids duplicate work if two launchers point to the same folder.

`scanOrchestrator` deduplicates by install path (normalized, case-insensitive on Windows) before calculating sizes.

---

## CLI Entry Point

```
Usage: gamestats [options]

Options:
  --port <number>       Port to run on (default: 3847)
  --no-open             Don't auto-open the browser
  --no-auto-shutdown    Keep the server running even when no clients are connected
  --config <path>       Path to a gamestats.config.json file (default: cwd)
  --help                Show help
```

`bin/gamestats.js`:
1. Parse CLI args.
2. Load settings.
3. Start Express server on `localhost:<port>`.
4. Open `http://localhost:<port>` in the default browser using the `open` npm package.
5. Log the URL to the terminal in case auto-open fails.

The `package.json` `"bin"` field points to `bin/gamestats.js` for `npx` support.

---

## Graceful Shutdown

The server must handle shutdown cleanly to avoid orphaned processes (especially important for `npx` usage where the user expects Ctrl+C to fully exit).

### Signal Handling

Listen for `SIGINT` (Ctrl+C) and `SIGTERM`:
1. Abort any running scan via the shared `AbortController`.
2. Close all active SSE connections.
3. Close the HTTP server (`server.close()`).
4. Exit the process.

### Auto-Shutdown (Idle Timeout)

After the last SSE client disconnects, start a **60-second idle timer**. If no new SSE connection is established within that window, the server shuts itself down and logs a message to the terminal: `"No active clients — shutting down."` This prevents orphaned server processes when the user closes the browser tab and forgets about the terminal.

- The timer resets whenever a new SSE connection opens.
- Disabled if `--no-auto-shutdown` flag is passed (for users who want persistent access).

---

## Error Handling

- **Inaccessible directories**: log a warning to server console, skip, continue scanning. Do not send error events for expected access-denied cases (e.g., `WindowsApps`).
- **Missing/corrupt metadata files**: fall back to folder-name detection for that launcher. Log the issue.
- **Empty scan results**: the `complete` SSE event contains an empty array. The UI shows: "No games found. Try adding a custom scan folder."
- **Scan cancellation**: supported via `AbortController`. If the user clicks "Scan Now" during an active scan, the server aborts the current scan and starts a new one.
- **Port in use**: try the configured port, and if taken, fail with a clear error message suggesting `--port`.
- **Path validation on `/api/open`**: reject paths that don't exist or aren't subdirectories of known scan/game locations.

---

## Security Considerations

- Server binds to `127.0.0.1` only — never `0.0.0.0`.
- `POST /api/open` validates that the requested path is within a known game install directory (from scanner results or custom folders). Arbitrary path traversal is rejected.
- No authentication needed — the app is local-only and single-user.
- User-supplied paths for custom folders are validated server-side (must exist, must be a directory).

---

## Logging

Use `console.log` / `console.warn` / `console.error` directly — no logging framework. All log messages are prefixed with a timestamp and tag for readability:

```
[gamestats 14:32:07] Server listening on http://127.0.0.1:3847
[gamestats 14:32:08] Scan started
[gamestats 14:32:08] Steam: found 12 games
[gamestats 14:32:08] Epic: launcher not found, skipping
[gamestats 14:32:09] WARN: GOG path "C:\GOG\Games" is inaccessible (EPERM), skipping
[gamestats 14:32:18] Scan complete: 24 games, 847.2 GB (18.2s)
```

Implement as a thin `log(level, message)` utility in a `server/log.js` module that prepends the `[gamestats HH:MM:SS]` prefix. Three levels: `info` (default), `warn`, `error`. No log files — stdout/stderr only.

---

## Dependencies

### Runtime
| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `open` | Open browser on startup |

### Dev
| Package | Purpose |
|---------|---------|
| `vitest` | Test runner |

> **Note on `winreg`**: For Ubisoft registry reading on Windows, use `child_process.execSync('reg query ...')` instead of an npm package — avoids a native dependency. Parse the output with a simple regex.

---

## Distribution

- Publish to npm as `gamestats`.
- Users install/run via `npx gamestats` or `npm install -g gamestats`.
- Requires Node.js 20+ (for `fs.readdir` recursive option).
- `package.json` specifies `"engines": { "node": ">=20" }`.
- Include a GitHub Actions workflow that runs tests and publishes to npm on tagged releases.

---

## Out of Scope (v1)

- Game icons or cover art
- Uninstall or delete functionality (read-only by design)
- Automatic/scheduled scanning
- Launcher API authentication
- GOG Galaxy SQLite database parsing (requires `better-sqlite3` native module and a build toolchain — v1 uses folder-name scanning instead)
- Linux/macOS game launcher support (file paths are Windows-specific; the server framework is portable)
- Disk usage visualization (treemap, pie chart)
- Export to CSV/JSON
- Authentication or multi-user support

---

## Implementation Order

1. **Project scaffolding** — `package.json`, directory structure, Express server skeleton, static file serving, CLI entry point with `open`
2. **Settings service** — load/save JSON via `env-paths`, custom folder CRUD
3. **API routes** — folders CRUD endpoints, scan endpoint stubs, SSE setup
4. **Directory size calculator** — recursive size calculation with `AbortSignal`
5. **Steam scanner** — most common launcher, good first implementation of the scanner pattern
6. **Remaining scanners** — Epic, GOG, EA, Ubisoft, Xbox, one at a time
7. **Custom folder scanner**
8. **Scan orchestrator** — aggregation, deduplication, size calculation, SSE progress events
9. **Frontend HTML/CSS** — dark theme, table layout, summary bar, manage folders panel
10. **Frontend JS** — SSE listener, DOM updates, sorting, filtering, open-folder action
11. **Polish** — error handling, edge cases, loading states, empty states
12. **Tests** — unit tests for scanners (mock filesystem), size calculator, API routes
