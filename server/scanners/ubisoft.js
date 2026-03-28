import { existsSync, readdirSync } from 'fs';
import { join, spawnSync } from 'child_process';
import { info, warn } from '../log.js';

const UBISOFT_DEFAULT_PATH = 'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games';
const UBISOFT_REGISTRY_PATH = 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs';

function cleanFolderName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export async function ubisoftIsAvailable() {
  if (existsSync(UBISOFT_DEFAULT_PATH)) {
    return true;
  }

  try {
    const result = spawnSync('reg', [
      'query',
      UBISOFT_REGISTRY_PATH,
    ], {
      encoding: 'utf-8',
      windowsVerbatimArguments: true,
    });

    return result.status === 0 && result.stdout.includes('Ubisoft');
  } catch {
    return false;
  }
}

export async function ubisoftScan(signal) {
  const games = [];

  if (existsSync(UBISOFT_DEFAULT_PATH)) {
    try {
      const subdirs = readdirSync(UBISOFT_DEFAULT_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());

      for (const dirent of subdirs) {
        if (signal?.aborted) break;

        const gamePath = join(UBISOFT_DEFAULT_PATH, dirent.name);
        
        if (existsSync(gamePath)) {
          games.push({
            name: cleanFolderName(dirent.name),
            path: gamePath,
            launcher: 'Ubisoft',
            size: null,
          });
        }
      }
    } catch (err) {
      warn(`Ubisoft default path scan error: ${err.message}`);
    }
  }

  try {
    const result = spawnSync('reg', [
      'query',
      UBISOFT_REGISTRY_PATH,
    ], {
      encoding: 'utf-8',
      windowsVerbatimArguments: true,
    });

    if (result.status === 0) {
      const lines = result.stdout.split('\n');
      
      for (const line of lines) {
        if (signal?.aborted) break;

        const pathMatch = line.match(/Path\s+REG_SZ\s+(.+)$/);
        if (pathMatch) {
          const path = pathMatch[1].trim();
          
          if (existsSync(path)) {
            games.push({
              name: cleanFolderName(path.split('\\').pop()),
              path: path,
              launcher: 'Ubisoft',
              size: null,
            });
          }
        }
      }
    }
  } catch (err) {
    warn(`Ubisoft registry query error: ${err.message}`);
  }

  info(`Ubisoft: found ${games.length} games`);
  return games;
}

export default {
  launcherName: 'Ubisoft',
  isAvailable: ubisoftIsAvailable,
  scan: ubisoftScan,
};
