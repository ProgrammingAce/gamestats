import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { info, warn } from '../log.js';

const EA_INSTALL_PATH = 'C:\\ProgramData\\EA Desktop\\InstallData';
const EA_GAMES_PATH = 'C:\\Program Files\\EA Games';

function cleanFolderName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export async function eaIsAvailable() {
  return existsSync(EA_INSTALL_PATH) || existsSync(EA_GAMES_PATH);
}

export async function eaScan(signal) {
  const games = [];

  if (existsSync(EA_INSTALL_PATH)) {
    try {
      const files = readdirSync(EA_INSTALL_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'));

      for (const file of files) {
        if (signal?.aborted) break;

        const filePath = join(EA_INSTALL_PATH, file.name);
        
        try {
          const content = readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);

          const installPath = data.installPath || data.InstallPath;
          const gameName = data.gameName || data.GameName || data.title || data.Title;

          if (installPath && gameName && existsSync(installPath)) {
            games.push({
              name: gameName,
              path: installPath,
              launcher: 'EA',
              size: null,
            });
          }
        } catch (err) {
          // Skip malformed JSON files
        }
      }
    } catch (err) {
      warn(`EA InstallData read error: ${err.message}`);
    }
  }

  if (existsSync(EA_GAMES_PATH)) {
    try {
      const subdirs = readdirSync(EA_GAMES_PATH, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());

      for (const dirent of subdirs) {
        if (signal?.aborted) break;

        const gamePath = join(EA_GAMES_PATH, dirent.name);
        
        if (existsSync(gamePath)) {
          games.push({
            name: cleanFolderName(dirent.name),
            path: gamePath,
            launcher: 'EA',
            size: null,
          });
        }
      }
    } catch (err) {
      warn(`EA Games folder scan error: ${err.message}`);
    }
  }

  info(`EA: found ${games.length} games`);
  return games;
}

export default {
  launcherName: 'EA',
  isAvailable: eaIsAvailable,
  scan: eaScan,
};
