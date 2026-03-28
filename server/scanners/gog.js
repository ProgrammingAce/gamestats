import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, expandTilde } from 'path';
import { info, warn } from '../log.js';

const GOG_GAMES_PATH = 'C:\\Program Files (x86)\\GOG Galaxy\\Games';
const GOG_CONFIG_PATH = '%LOCALAPPDATA%\\GOG.com\\Galaxy\\Configuration';

function cleanFolderName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function getWindowsLocalAppData() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return expandTilde(process.env.LOCALAPPDATA);
  }
  return null;
}

function getGogConfigPath() {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'GOG.com', 'Galaxy', 'Configuration');
  }
  return null;
}

async function scanConfigForLibraries(configPath) {
  const libraries = [];

  if (!existsSync(configPath)) {
    return libraries;
  }

  try {
    const files = readdirSync(configPath, { withFileTypes: true })
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
      .map(dirent => dirent.name);

    for (const file of files) {
      const filePath = join(configPath, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const config = JSON.parse(content);

        if (config.library_paths && Array.isArray(config.library_paths)) {
          for (const libPath of config.library_paths) {
            if (typeof libPath === 'string' && libPath.trim()) {
              libraries.push(libPath.trim());
            }
          }
        }
      } catch (err) {
        warn(`GOG config ${file}: parse error - ${err.message}`);
      }
    }
  } catch (err) {
    warn(`GOG config directory scan error: ${err.message}`);
  }

  return libraries;
}

export async function gogIsAvailable() {
  if (existsSync(GOG_GAMES_PATH)) {
    return true;
  }

  const configPath = getGogConfigPath();
  if (configPath && existsSync(configPath)) {
    const libraries = await scanConfigForLibraries(configPath);
    return libraries.length > 0;
  }

  return false;
}

export async function gogScan(signal) {
  const games = [];
  const seenPaths = new Set();

  async function addGame(path, subdir) {
    if (signal?.aborted) return;
    if (seenPaths.has(path.toLowerCase())) return;

    if (existsSync(path)) {
      seenPaths.add(path.toLowerCase());
      games.push({
        name: cleanFolderName(subdir),
        path: path,
        launcher: 'GOG',
        size: null,
      });
    }
  }

  if (existsSync(GOG_GAMES_PATH)) {
    try {
      const subdirs = readdirSync(GOG_GAMES_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const subdir of subdirs) {
        if (signal?.aborted) break;
        const gamePath = join(GOG_GAMES_PATH, subdir);
        await addGame(gamePath, subdir);
      }
    } catch (err) {
      warn(`GOG default path scan error: ${err.message}`);
    }
  }

  const configPath = getGogConfigPath();
  if (configPath) {
    try {
      const libraries = await scanConfigForLibraries(configPath);

      for (const libPath of libraries) {
        if (signal?.aborted) break;

        if (!existsSync(libPath)) {
          warn(`GOG library path "${libPath}" not found, skipping`);
          continue;
        }

        const subdirs = readdirSync(libPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const subdir of subdirs) {
          if (signal?.aborted) break;
          const gamePath = join(libPath, subdir);
          await addGame(gamePath, subdir);
        }
      }
    } catch (err) {
      warn(`GOG config scan error: ${err.message}`);
    }
  }

  info(`GOG: found ${games.length} games`);
  return games;
}

export default {
  launcherName: 'GOG',
  isAvailable: gogIsAvailable,
  scan: gogScan,
};
