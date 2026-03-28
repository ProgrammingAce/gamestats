import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { info, warn } from '../log.js';
import { scan, isAvailable } from './scanner.js';

const EPIC_MANIFESTS_PATH = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';

function cleanFolderName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export async function epicIsAvailable() {
  return existsSync(EPIC_MANIFESTS_PATH);
}

export async function epicScan(signal) {
  const games = [];

  if (!existsSync(EPIC_MANIFESTS_PATH)) {
    return games;
  }

  try {
    const manifestFiles = readdirSync(EPIC_MANIFESTS_PATH, { withFileTypes: true })
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.item'))
      .map(dirent => dirent.name);

    for (const manifestFile of manifestFiles) {
      if (signal?.aborted) break;

      const manifestPath = join(EPIC_MANIFESTS_PATH, manifestFile);
      
      try {
        const content = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(content);

        const displayName = manifest.DisplayName || manifest.Title;
        const installLocation = manifest.InstallLocation;

        if (displayName && installLocation && existsSync(installLocation)) {
          games.push({
            name: displayName,
            path: installLocation,
            launcher: 'Epic',
            size: null,
          });
        }
      } catch (err) {
        warn(`Epic manifest parse error (${manifestFile}): ${err.message}`);
      }
    }
  } catch (err) {
    warn(`Epic scan error: ${err.message}`);
  }

  info(`Epic: found ${games.length} games`);
  return games;
}

export default {
  launcherName: 'Epic',
  isAvailable: epicIsAvailable,
  scan: epicScan,
};
