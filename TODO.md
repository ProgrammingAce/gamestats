# TODO - GameStats Improvements

## Bugs

- [x] **Duplicate `/restart` route** — `server/routes/scan.js` has the `GET /restart` handler defined twice (lines 160-172). Remove the duplicate.
- [x] **`updateSummary()` mutates `state.games`** — `public/app.js:351` calls `state.games.sort()` which sorts the array in place, corrupting the original order. Use `[...state.games].sort(...)` or `toSorted()` instead.
- [x] **`addCustomFolder()` references undefined `input`** — `public/app.js:418` uses `input.value = ''` but `input` is not defined in that function scope. The caller already clears the input, so remove this line.
- [x] **SSE error disables scan button permanently** — `public/app.js:267` sets `scanBtn.disabled = true` on SSE error. Should be `false` so the user can retry.
- [x] **`data-path` attribute not escaped in renderTable** — `public/app.js:336` puts `game.path` raw into a `data-path` attribute. Paths with quotes could break the HTML. Use `escapeHtml()` on it.

## Code Quality

- [x] **Battle.net scanner uses raw `console.log/warn`** — `server/scanners/battlenet.js` has ~10 direct `console.log`/`console.warn` calls instead of importing and using the `log.js` module like every other file. Replace with `info()`/`warn()` from `server/log.js`.
- [x] **Remove debug logging from `app.js`** — The frontend is littered with `console.log('Game event raw:', ...)`, `console.log('Progress event:', ...)`, etc. These were useful during development but should be removed or gated behind a debug flag for production.
- [x] **Duplicate `launcherNames` array** — `public/app.js` defines the same launcher names array in both `renderLaunchers()` (line 95) and `renderLauncherFolders()` (line 131). Extract to a shared constant.
- [x] **Duplicate folder/launcher UI for two pages** — The home page and folders page each have their own copies of folder lists and launcher lists (suffixed with `2`). This creates duplicated HTML and JS logic. Consider rendering a single set of controls and moving them between pages, or using a template approach.

## Features

- [x] **Format game names better** — `formatName()` in `app.js` exists but is never called. Game names from launchers are displayed raw. Apply `formatName()` for custom folder games (which use directory names) while preserving launcher-provided names.
- [x] **Show size in MB for small games** — `formatSize()` always formats as GB. Games under 1 GB show as "0.1 GB" or "0.0 GB". Show MB when size < 1 GB (e.g., "542.3 MB").
- [x] **Export game list** — Add a button to export the scanned game list as CSV or JSON for use in spreadsheets or other tools.
- [x] **Search by launcher** — The filter only searches by game name. Allow filtering by launcher (e.g., typing "steam:" to filter to Steam games only) or add a launcher dropdown filter.
- [x] **Remember last scan results** — Persist the last scan results to `settings.json` so the UI can show them immediately on load while a fresh scan runs in the background.
- [x] **Show scan progress bar** — Replace the text-only "Calculating: game (3/47)..." with a visual progress bar showing percentage complete.
- [ ] **Dark/light theme toggle** — The app is dark theme only. Some users prefer light themes. Add a toggle that persists to settings.
- [ ] **Keyboard shortcuts** — Add keyboard shortcuts: `F5` or `Ctrl+R` to rescan, `/` to focus the filter input, `Escape` to clear filter.

## Testing

- [ ] **Expand test coverage** — Current tests only check that scanners export the correct interface. Add behavioral tests: mock the filesystem and verify that each scanner correctly parses its launcher's data files (VDF for Steam, `.item` JSON for Epic, etc.).
- [ ] **Add frontend tests** — `applyFiltersAndSort()`, `formatSize()`, and `formatName()` are pure functions that can be unit tested. Extract them for testing or add a basic test harness.
- [ ] **Test the SSE scan flow end-to-end** — Use `supertest` or similar to verify that `POST /api/scan` + `GET /api/scan` (SSE) returns the expected event sequence.

## Platform Support

- [ ] **macOS/Linux launcher detection** — Most scanners hardcode Windows paths (`C:\Program Files`, registry queries). Add platform-specific path resolution for macOS (e.g., `~/Library/Application Support/Steam`) and Linux (e.g., `~/.steam`).
- [ ] **Improve Xbox detection** — The Xbox scanner only checks `C:\XboxGames`. Xbox Game Pass games can also be installed in other locations. Check the registry or WinGet for more paths.

## Performance

- [ ] **Parallelize size calculations** — `scanOrchestrator.js` calculates directory sizes sequentially. For games on different physical drives, parallel calculation would be faster. Group games by drive letter and parallelize across drives.
- [ ] **Cache directory sizes** — Large game directories take time to measure. Cache sizes with a file modification timestamp and skip recalculation if unchanged.
- [ ] **Debounce filter input** — `app.js` re-filters and re-renders on every keystroke. Add a small debounce (150-200ms) for smoother typing on large game lists.

(End of file - total 44 lines)
