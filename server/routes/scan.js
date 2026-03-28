import { Router } from 'express';
import { info, warn } from '../log.js';
import { ScanOrchestrator } from '../services/scanOrchestrator.js';
import { updateScanResults } from '../services/sharedState.js';

const router = Router();
const orchestrator = new ScanOrchestrator();

let activeSses = [];
let scanHasRun = false;

function broadcastSse(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  activeSses.forEach((res) => {
    try {
      res.write(message);
    } catch (err) {
      warn(`Failed to broadcast SSE: ${err.message}`);
    }
  });
}

function completeScan(games, duration, startTime, notes) {
  const totalSize = games.reduce((sum, g) => sum + (g.size || 0), 0);
  updateScanResults(games);
  broadcastSse('complete', {
    phase: 'complete',
    totalGames: games.length,
    totalSize: totalSize,
    durationMs: duration,
    notes: notes || [],
    timestamp: new Date().toLocaleString()
  });
  activeSses.forEach((res) => res.end());
  info(`Scan complete: ${games.length} games, ${totalSize} bytes (${duration}ms)`);
}

router.get('/', (req, res) => {
  info('SSE connection established');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  activeSses.push(res);

  if (!scanHasRun) {
    scanHasRun = true;
    info('Auto-triggering initial scan');
    const startTime = Date.now();
    
    orchestrator.abort();
    
    orchestrator.startScan(startTime, broadcastSse).then((result) => {
      const games = Array.isArray(result) ? result : result.games;
      const notes = Array.isArray(result) ? [] : result.notes || [];
      const duration = Date.now() - startTime;
      completeScan(games, duration, startTime, notes);
    }).catch((err) => {
      if (err.message === 'Size calculation aborted') {
        info('Auto-scan aborted');
      } else {
        warn(`Auto-scan error: ${err.message}`);
        broadcastSse('error', { message: err.message });
        completeScan([], 0, startTime, []);
      }
    });
  }

  req.on('close', () => {
    const index = activeSses.indexOf(res);
    if (index > -1) {
      activeSses.splice(index, 1);
      info('SSE connection closed');
    }
  });

  return res;
});

router.post('/', async (req, res) => {
  info('Scan started');
  
  const startTime = Date.now();

  res.status(202).json({ status: 'started' });

  try {
     orchestrator.abort();

     broadcastSse('progress', { phase: 'scanning', launcher: 'Initializing', gamesFound: 0 });

     const result = await orchestrator.startScan(startTime, broadcastSse);
     const games = Array.isArray(result) ? result : result.games;
     const notes = Array.isArray(result) ? [] : result.notes || [];

     const duration = Date.now() - startTime;
     completeScan(games, duration, startTime, notes);
   } catch (err) {
    if (err.message === 'Size calculation aborted') {
      info('Scan aborted by user');
    } else {
      warn(`Scan error: ${err.message}`);
      broadcastSse('error', { message: err.message });
    }
  }
});

export default router;
export { activeSses };
