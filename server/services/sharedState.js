let scanResults = new Set();
let customConfigPath = null;

async function updateScanResults(games) {
  scanResults.clear();
  for (const game of games) {
    const normalizedPath = game.path.toLowerCase().replace(/\\/g, '/');
    scanResults.add(normalizedPath);
  }
  const { getCustomPaths } = await import('./settingsService.js');
  for (const path of getCustomPaths()) {
    const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
    scanResults.add(normalizedPath);
  }
}

function isPathWithinKnownLocations(path) {
  const normalizedPath = normalizePath(path);
  
  if (scanResults.has(normalizedPath)) {
    return true;
  }
  
  for (const knownPath of scanResults) {
    if (normalizedPath.startsWith(knownPath + '/') || normalizedPath === knownPath) {
      return true;
    }
  }
  
  return false;
}

function normalizePath(path) {
  return path.toLowerCase().replace(/\\/g, '/');
}

function setCustomConfigPath(path) {
  customConfigPath = path;
}

function getCustomConfigPath() {
  return customConfigPath;
}

export {
  scanResults,
  updateScanResults,
  isPathWithinKnownLocations,
  normalizePath,
  setCustomConfigPath,
  getCustomConfigPath
};
