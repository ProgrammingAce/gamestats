import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getLauncherFolders } from '../services/settingsService.js';

const SCANNER_NAME = 'Battle.net';

function getBattleNetPaths() {
  const paths = [];
  const launcherFolders = getLauncherFolders();
  const customPath = launcherFolders.battlenet;
  
  if (customPath && existsSync(customPath)) {
    paths.push(customPath);
  }
  
  if (process.platform === 'win32') {
    const basePaths = [
      join(process.env['ProgramFiles'] || 'C:/Program Files', 'Battle.net'),
      join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Battle.net'),
      join(homedir(), 'Battle.net'),
    ];
    
    for (const basePath of basePaths) {
      if (existsSync(basePath)) {
        if (!paths.includes(basePath)) {
          paths.push(basePath);
        }
      }
    }
  } else if (process.platform === 'darwin') {
    const battleNetPath = join(homedir(), 'Battle.net');
    if (existsSync(battleNetPath)) {
      if (!paths.includes(battleNetPath)) {
        paths.push(battleNetPath);
      }
    }
  }
  
  return paths;
}

export const isAvailable = async () => {
  const paths = getBattleNetPaths();
  console.log(`[Battle.net] isAvailable: found ${paths.length} paths:`, paths);
  return paths.length > 0;
};

export const scan = async function(signal) {
  const paths = getBattleNetPaths();
  console.log(`[Battle.net] scan: scanning ${paths.length} paths:`, paths);
  const games = [];
  
  for (const path of paths) {
    if (signal.aborted) break;
    
    console.log(`[Battle.net] Checking path: ${path}`);
    
    const gamesConfig = join(path, 'InstalledGames.json');
    const gamesFolder = join(path, 'Games');
    
    if (existsSync(gamesConfig)) {
      try {
        const content = readFileSync(gamesConfig, 'utf-8');
        const data = JSON.parse(content);
        
        if (data.apps && Array.isArray(data.apps)) {
          for (const app of data.apps) {
            if (signal.aborted) break;
            
            const gamePath = join(path, 'Games', app.id);
            
            if (existsSync(gamePath)) {
              games.push({
                name: app.displayName || app.title || `Battle.net Game (${app.id})`,
                path: gamePath,
                launcher: SCANNER_NAME,
              });
            }
          }
        }
      } catch (err) {
        console.warn(`[Battle.net] Failed to parse ${gamesConfig}: ${err.message}`);
      }
    }
    
    if (existsSync(gamesFolder)) {
      try {
        const gameIds = await getGameIdsFromDir(gamesFolder);
        console.log(`[Battle.net] Found ${gameIds.length} games in ${gamesFolder}`);
        for (const gameId of gameIds) {
          if (signal.aborted) break;
          
          const gamePath = join(gamesFolder, gameId);
          
          if (await isValidGameFolder(gamePath)) {
            games.push({
              name: `Battle.net Game (${gameId})`,
              path: gamePath,
              launcher: SCANNER_NAME,
            });
          }
        }
      } catch (err) {
        console.warn(`[Battle.net] Failed to scan ${gamesFolder}: ${err.message}`);
      }
    }
    
    if (signal.aborted) break;
    
    try {
      const gameIds = await getGameIdsFromDir(path);
      console.log(`[Battle.net] Found ${gameIds.length} items directly in ${path}`);
      for (const gameId of gameIds) {
        if (signal.aborted) break;
        
        const gamePath = join(path, gameId);
        
        if (await isValidGameFolder(gamePath)) {
          games.push({
            name: `Battle.net Game (${gameId})`,
            path: gamePath,
            launcher: SCANNER_NAME,
          });
        }
      }
    } catch (err) {
      console.warn(`[Battle.net] Failed to scan ${path}: ${err.message}`);
    }
  }
  
  console.log(`[Battle.net] scan complete: ${games.length} games found`);
  return games;
};

async function getGameIdsFromDir(dirPath) {
  const { readdir } = await import('fs/promises');
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

async function isValidGameFolder(gamePath) {
  const { existsSync } = await import('fs');
  const { readdir } = await import('fs/promises');
  
  if (!existsSync(gamePath)) return false;
  
  try {
    const files = await readdir(gamePath);
    return files.length > 0;
  } catch {
    return false;
  }
}

export const launcherName = SCANNER_NAME;

export default {
  launcherName,
  isAvailable,
  scan,
};

