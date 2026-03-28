import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { info } from '../log.js';

export async function customFolderScan(signal, customPaths) {
  const games = [];

  for (const customPath of customPaths) {
    if (signal?.aborted) break;

    const path = typeof customPath === 'string' ? customPath : customPath.path;
    const name = typeof customPath === 'string' ? null : customPath.name;

    if (!existsSync(path)) {
      continue;
    }

    try {
      const subdirs = readdirSync(path, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory());

      for (const dirent of subdirs) {
        if (signal?.aborted) break;

        const gamePath = join(path, dirent.name);
        
        if (existsSync(gamePath)) {
          games.push({
            name: formatName(dirent.name),
            path: gamePath,
            launcher: 'Custom',
            size: null,
            customName: name,
          });
        }
      }
    } catch (err) {
      // Skip inaccessible custom paths
    }
  }

  info(`Custom: found ${games.length} games`);
  return { games, notes: [] };
}

function formatName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export default {
  launcherName: 'Custom',
  scan: customFolderScan,
};
