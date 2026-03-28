import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { info, warn } from '../log.js';
import { scan, isAvailable } from './scanner.js';

const STEAM_CONFIG_PATH = 'C:\\Program Files (x86)\\Steam\\config\\libraryfolders.vdf';
const STEAM_DEFAULT_PATH = 'C:\\Program Files (x86)\\Steam\\steamapps';

function parseVDF(content) {
  const result = {};
  const lines = content.split('\n');
  let currentKey = null;
  let currentObject = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}') continue;

    const match = trimmed.match(/^"(.*)"\s*(\{|\d+|"([^"]*)")?/);
    if (match) {
      const key = match[1];
      const value = match[2];
      const stringValue = match[3];

      if (currentObject !== null) {
        if (value === '{') {
          currentObject[key] = {};
          currentObject = currentObject[key];
        } else if (value === '}') {
          currentObject = Object.getPrototypeOf(currentObject);
        } else {
          currentObject[key] = stringValue !== undefined ? stringValue : parseInt(value, 10);
        }
      } else if (currentKey === null) {
        if (value === '{') {
          result[key] = {};
          currentObject = result[key];
        } else {
          result[key] = value !== undefined ? value : parseInt(value, 10);
        }
      }
    }
  }

  return result;
}

export async function steamIsAvailable() {
  return existsSync(STEAM_CONFIG_PATH) || existsSync(STEAM_DEFAULT_PATH);
}

export async function steamScan(signal) {
  const games = [];
  let libraryFolders = [];

  try {
    const configPath = existsSync(STEAM_CONFIG_PATH) 
      ? STEAM_CONFIG_PATH 
      : join(STEAM_DEFAULT_PATH, '..', 'config', 'libraryfolders.vdf');

    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = parseVDF(content);
      
      if (parsed['libraryfolders']) {
        const folders = parsed['libraryfolders'];
        for (const key in folders) {
          if (typeof folders[key] === 'string' && folders[key].startsWith('"')) {
            const path = folders[key].slice(1, -1);
            libraryFolders.push(path);
          }
        }
      }
    }
  } catch (err) {
    warn(`Steam config read error: ${err.message}`);
  }

  if (libraryFolders.length === 0 && existsSync(STEAM_DEFAULT_PATH)) {
    libraryFolders.push(STEAM_DEFAULT_PATH);
  }

  for (const libraryPath of libraryFolders) {
    if (signal?.aborted) break;

    const steamappsPath = join(libraryPath, 'steamapps');
    if (!existsSync(steamappsPath)) continue;

    try {
      const manifestFiles = readdirSync(steamappsPath, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.startsWith('appmanifest_') && dirent.name.endsWith('.acf'))
        .map(dirent => dirent.name);

      for (const manifestFile of manifestFiles) {
        if (signal?.aborted) break;

        const manifestPath = join(steamappsPath, manifestFile);
        const content = readFileSync(manifestPath, 'utf-8');
        
        const nameMatch = content.match(/"name"\s+"([^"]+)"/);
        const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/);
        const appidMatch = manifestFile.match(/appmanifest_(\d+)\.acf/);

        if (nameMatch && installDirMatch && appidMatch) {
          const gameName = nameMatch[1];
          const installdir = installDirMatch[1];
          const appId = appidMatch[1];
          
          const gamePath = join(libraryPath, 'common', installdir);
          
          if (existsSync(gamePath)) {
            games.push({
              name: gameName,
              path: gamePath,
              launcher: 'Steam',
              size: null,
            });
          }
        }
      }
    } catch (err) {
      warn(`Steam scan error for ${libraryPath}: ${err.message}`);
    }
  }

  info(`Steam: found ${games.length} games`);
  return games;
}

export default {
  launcherName: 'Steam',
  isAvailable: steamIsAvailable,
  scan: steamScan,
};
