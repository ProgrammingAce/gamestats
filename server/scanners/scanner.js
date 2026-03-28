/**
 * Base interface for game scanner modules
 * @typedef {Object} GameEntry
 * @property {string} name       - Display name of the game
 * @property {string} path       - Absolute install path
 * @property {string} launcher   - Launcher name (e.g., "Steam", "Epic")
 * @property {number|null} size  - Size in bytes (null until calculated)
 */

/**
 * Scanner interface
 * @typedef {Object} Scanner
 * @property {string} launcherName
 * @property {Function} isAvailable
 * @property {Function} scan
 */

/**
 * Check if the launcher is installed
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  return false;
}

/**
 * Discover installed games
 * @param {AbortSignal} signal
 * @returns {Promise<GameEntry[]>}
 */
export async function scan(signal) {
  return [];
}
