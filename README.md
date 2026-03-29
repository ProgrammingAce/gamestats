# GameStats

A local utility that scans your installed games across all major launchers and ranks them by disk usage. Runs a lightweight local server with a browser-based UI — no account, no telemetry, no network access.

## Features

- Auto-detects games from Steam, Epic Games, GOG Galaxy, EA App, Ubisoft Connect, Xbox Game Pass, and Battle.net
- Calculates and ranks games by disk size
- Streams results in real-time as each game is measured
- Add custom folders to scan alongside launcher libraries
- Export results as CSV or JSON
- Search and sort the game list
- Click any install path to open it in your file explorer
- Saves last scan results between sessions

## Requirements

- Node.js v20+

## Usage

No installation required:

```bash
npx gamestats
```

Opens `http://127.0.0.1:3847` in your default browser automatically. The server binds to localhost only and shuts down 60 seconds after the browser disconnects.

### Install globally

```bash
npm install -g gamestats
gamestats
```

### CLI options

```
--port <number>       Port to use (default: 3847)
--no-open             Don't auto-open browser
--no-auto-shutdown    Keep server running when no clients are connected
--config <path>       Path to a gamestats.config.json file
```

## Custom folders via config file

Create a `gamestats.config.json` in your working directory to pre-configure extra scan paths:

```json
{
  "scanPaths": [
    "D:\\Games",
    { "path": "F:\\LAN-Party", "name": "LAN Drive" }
  ]
}
```

Paths can be plain strings or objects with an optional `name` that appears in the Launcher column. This file is read-only from the UI; edit it manually.

You can also add and remove folders at any time through the "Manage Folders" panel in the UI.

## Platform support

| Platform | Launcher auto-detection | Custom folders |
|----------|------------------------|----------------|
| Windows  | All launchers          | Yes            |
| macOS    | Not yet                | Yes            |
| Linux    | Not yet                | Yes            |

## Development

```bash
npm install
npm start          # run
npm run dev        # run with --watch
npm test           # run tests (watch mode)
npm run test:run   # run tests once
```

## Settings

User preferences and last scan results are saved to:

- **Windows:** `%APPDATA%\gamestats\settings.json`
- **macOS/Linux:** `~/.gamestats/settings.json`
