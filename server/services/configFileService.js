import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { info, warn, error } from '../log.js';
import { getCustomConfigPath } from '../index.js';

const CONFIG_FILE = 'gamestats.config.json';

function validateEntry(entry, index) {
  if (typeof entry === 'string') {
    return { path: entry, name: null, valid: true };
  }
  
  if (typeof entry === 'object' && entry !== null) {
    if (typeof entry.path === 'string' && entry.path.length > 0) {
      return { path: entry.path, name: entry.name || null, valid: true };
    }
    warn(`Config entry ${index}: skipping — 'path' must be a string`);
    return { path: null, name: null, valid: false };
  }
  
  warn(`Config entry ${index}: skipping — expected string or object`);
  return { path: null, name: null, valid: false };
}

export async function loadConfigFile(cwd = process.cwd()) {
  const customConfigPath = getCustomConfigPath();
  const configPath = customConfigPath ? resolve(customConfigPath) : resolve(cwd, CONFIG_FILE);
  
  if (!existsSync(configPath)) {
    info(`No ${CONFIG_FILE} found in ${cwd}`);
    return {
      folders: [],
      configFileFound: false,
      hasErrors: false,
    };
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    
    if (!config || typeof config !== 'object') {
      warn(`${CONFIG_FILE}: malformed, expected object`);
      return {
        folders: [],
        configFileFound: true,
        hasErrors: true,
      };
    }
    
    const scanPaths = config.scanPaths || [];
    const folders = [];
    let hasErrors = false;
    
    for (let index = 0; index < scanPaths.length; index++) {
      const entry = scanPaths[index];
      const validated = validateEntry(entry, index + 1);
      
      if (!validated.valid) {
        hasErrors = true;
        continue;
      }
      
      const absolutePath = resolve(validated.path);
      
      if (!await validatePath(absolutePath)) {
        warn(`${CONFIG_FILE}: skipping invalid path ${validated.path}`);
        hasErrors = true;
        continue;
      }
      
      folders.push({
        path: validated.path,
        name: validated.name,
        absolutePath,
      });
    }
    
    if (folders.length > 0) {
      info(`Found ${folders.length} scan paths in ${CONFIG_FILE}`);
    }
    
    return {
      folders,
      configFileFound: true,
      hasErrors,
    };
  } catch (err) {
    error(`${CONFIG_FILE} parse error: ${err.message}`);
    return {
      folders: [],
      configFileFound: true,
      hasErrors: true,
    };
  }
}

async function validatePath(path) {
  try {
    const { statSync } = await import('fs');
    const stats = statSync(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
