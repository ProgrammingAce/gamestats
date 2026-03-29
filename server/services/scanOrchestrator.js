import { info, warn } from '../log.js';
import steam from '../scanners/steam.js';
import epic from '../scanners/epic.js';
import gog from '../scanners/gog.js';
import ea from '../scanners/ea.js';
import ubisoft from '../scanners/ubisoft.js';
import xbox from '../scanners/xbox.js';
import battlenet from '../scanners/battlenet.js';
import customFolder from '../scanners/customFolder.js';
import { DirectorySizeCalculator } from '../services/directorySizeCalculator.js';
import { getCustomPaths, getLauncherSettings } from '../services/settingsService.js';

const ALL_SCANNERS = [steam, epic, gog, ea, ubisoft, xbox, battlenet];

function getEnabledScanners() {
  const settings = getLauncherSettings();
  return ALL_SCANNERS.filter((scanner) => {
    const launcherName = scanner.launcherName.toLowerCase();
    if (settings[launcherName] === false) return false;
    return settings.launchers?.[launcherName] !== false;
  });
}

export class ScanOrchestrator {
  constructor() {
    this.abortController = new AbortController();
    this.sizeCalculator = new DirectorySizeCalculator();
    this.activeScanners = new Map();
    this.running = false;
  }

  async startScan(startTime, sseSend) {
    this.running = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const customPaths = getCustomPaths();
    const allNotes = [];

// Run enabled launcher scanners in parallel
     const scannerPromises = getEnabledScanners().map(async (scanner) => {
      const isAvailable = await scanner.isAvailable();
      
      let games = [];
      let notes = [];
      
      if (isAvailable) {
        const result = await scanner.scan(signal);
        games = Array.isArray(result) ? result : result.games;
        notes = Array.isArray(result) ? [] : result.notes || [];
        
        if (games.length > 0 || notes.length > 0) {
          sseSend({
            event: 'progress',
            data: {
              phase: 'scanning',
              launcher: scanner.launcherName,
              gamesFound: games.length,
            },
          });
        }
      }
      
      return { games, notes, launcherName: scanner.launcherName };
    });

    const launcherResults = await Promise.all(scannerPromises);
    const launcherGames = launcherResults.flatMap(r => r.games);

    // Add custom folder games
    if (customPaths.length > 0) {
      const result = await customFolder.scan(signal, customPaths);
      const customGames = Array.isArray(result) ? result : result.games;
      const customNotes = Array.isArray(result) ? [] : result.notes || [];
      launcherGames.push(...customGames);
      allNotes.push(...customNotes);
    }

    // Deduplicate by normalized path
    const dedupedGames = this.deduplicateGames(launcherGames);

    // Calculate sizes sequentially
    for (let i = 0; i < dedupedGames.length; i++) {
      if (signal.aborted) break;

      const game = dedupedGames[i];
      const size = await this.sizeCalculator.calculateSize(game.path, signal);
      game.size = size;

      const broadcastData = {
        event: 'game',
        data: {
          phase: 'calculating',
          current: i + 1,
          total: dedupedGames.length,
          game,
        },
      };
      sseSend(broadcastData);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    launcherResults.filter(r => r.notes && r.notes.length > 0).forEach(r => {
      allNotes.push(...r.notes);
    });

    return { games: dedupedGames, notes: allNotes };
  }

  deduplicateGames(games) {
    const seen = new Set();
    const deduped = [];

    for (const game of games) {
      const normalizedPath = game.path.toLowerCase().replace(/\\/g, '/');
      
      if (!seen.has(normalizedPath)) {
        seen.add(normalizedPath);
        deduped.push(game);
      }
    }

    return deduped;
  }

  abort() {
    this.abortController.abort();
    this.sizeCalculator.abort();
    this.running = false;
  }
}
