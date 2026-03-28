import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { info, warn, error } from '../log.js';

function getSettingsPath() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return join(process.env.APPDATA, 'gamestats', 'settings.json');
  }
  return join(homedir(), '.gamestats', 'settings.json');
}

const SETTINGS_FILE = getSettingsPath();
const SETTINGS_DIR = join(SETTINGS_FILE, '..');

export function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) {
    info('No settings file found, creating defaults');
    return {
      customScanPaths: [],
      port: 3847,
    };
  }

  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    error(`Failed to parse settings.json: ${err.message}`);
    return {
      customScanPaths: [],
      port: 3847,
    };
  }
}

export function saveSettings(settings) {
  try {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    info(`Settings saved to ${SETTINGS_FILE}`);
  } catch (err) {
    error(`Failed to save settings.json: ${err.message}`);
  }
}

export function addCustomPath(path) {
  const settings = loadSettings();
  
  const normalizedPath = normalizePath(path);
  const existingPaths = settings.customScanPaths.map(p => normalizePath(p));
  
  if (!existingPaths.includes(normalizedPath)) {
    settings.customScanPaths.push(path);
    saveSettings(settings);
  }
  
  return settings.customScanPaths;
}

export function removeCustomPath(path) {
  const settings = loadSettings();
  const normalizedPath = normalizePath(path);
  
  settings.customScanPaths = settings.customScanPaths.filter(p => 
    normalizePath(p) !== normalizedPath
  );
  
  saveSettings(settings);
  return settings.customScanPaths;
}

export function getCustomPaths() {
  const settings = loadSettings();
  return settings.customScanPaths;
}

export function getPort() {
  const settings = loadSettings();
  return settings.port || 3847;
}

export function setPort(port) {
  const settings = loadSettings();
  settings.port = port;
  saveSettings(settings);
  return settings.port;
}

function normalizePath(path) {
  return path.toLowerCase().replace(/\\/g, '/');
}
