import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { info, warn } from '../log.js';

const XBOX_GAMES_PATH = 'C:\\XboxGames';
const WINDOWS_APPS_PATH = 'C:\\ProgramFiles\\WindowsApps';

function cleanFolderName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export async function xboxIsAvailable() {
  return existsSync(XBOX_GAMES_PATH);
}

export async function xboxScan(signal) {
  const games = [];
  const notes = [
    {
      type: 'warning',
      launcher: 'Xbox',
      message: 'MS Store apps under WindowsApps are generally inaccessible',
    },
  ];

  if (!existsSync(XBOX_GAMES_PATH)) {
    return { games, notes };
  }

  try {
    const subdirs = readdirSync(XBOX_GAMES_PATH, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    for (const dirent of subdirs) {
      if (signal?.aborted) break;

      const gamePath = join(XBOX_GAMES_PATH, dirent.name);
      
      if (dirent.name === 'WindowsApps') {
        continue;
      }

      if (existsSync(gamePath)) {
        games.push({
          name: cleanFolderName(dirent.name),
          path: gamePath,
          launcher: 'Xbox',
          size: null,
        });
      }
    }
  } catch (err) {
    warn(`Xbox scan error: ${err.message}`);
  }

  info(`Xbox: found ${games.length} games`);
  
  return { games, notes };
}

export default {
  launcherName: 'Xbox',
  isAvailable: xboxIsAvailable,
  scan: xboxScan,
  notes: [],
};
