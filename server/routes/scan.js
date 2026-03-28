import { Router } from 'express';
import { info, warn } from '../log.js';
import { ScanOrchestrator } from '../services/scanOrchestrator.js';
import { updateScanResults } from '../services/sharedState.js';

const router = Router();
const orchestrator = new ScanOrchestrator();

let activeSses = [];
let postSse = null;
let scanHasRun = false;

function broadcastSse(inputEvent, inputData) {
  let event, payload;
  if (typeof inputEvent === 'object' && inputEvent.event) {
    event = inputEvent.event;
    payload = inputEvent.data;
  } else if (typeof inputData === 'object' && inputData.data !== undefined) {
    event = inputEvent;
    payload = inputData.data;
  } else {
    event = inputEvent;
    payload = inputData;
  }
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  activeSses.forEach((res) => {
    try {
      if (!res.writableEnded && !res.writableFinished) {
        res.write(message);
      }
    } catch (err) {
      warn(`Failed to broadcast SSE: ${err.message}`);
      const index = activeSses.indexOf(res);
      if (index > -1) {
        activeSses.splice(index, 1);
      }
    }
  });
}

function keepAlive() {
  const message = `event: ping\ndata: {}\n\n`;
  activeSses.forEach((res) => {
    try {
      if (!res.writableEnded && !res.writableFinished) {
        res.write(message);
      }
    } catch (err) {
      const index = activeSses.indexOf(res);
      if (index > -1) {
        activeSses.splice(index, 1);
      }
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
  setTimeout(() => {
    if (postSse) {
      try {
        if (!postSse.writableEnded && !postSse.writableFinished) {
          postSse.end();
        }
      } catch (err) {
        warn(`Failed to close SSE: ${err.message}`);
      }
    }
    activeSses.forEach((res) => {
      try {
        if (!res.writableEnded && !res.writableFinished) {
          res.end();
        }
      } catch (err) {
        warn(`Failed to close SSE: ${err.message}`);
      }
    });
    activeSses = [];
  }, 100);
  info(`Scan complete: ${games.length} games, ${totalSize} bytes (${duration}ms)`);
}

router.get('/', (req, res) => {
  info('SSE connection established');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  activeSses.push(res);
  
  const keepAliveInterval = setInterval(() => {
    keepAlive();
  }, 15000);

  if (scanHasRun) {
    res.write('event: progress\ndata: {"phase":"scanning","launcher":"Existing scan","gamesFound":0}\n\n');
  } else {
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

req.once('close', () => {
    clearInterval(keepAliveInterval);
    const index = activeSses.indexOf(res);
    if (index > -1) {
      activeSses.splice(index, 1);
      info('SSE connection closed');
    }
  });

req.on('error', (err) => {
    clearInterval(keepAliveInterval);
    info('SSE connection error:', err.message);
    const index = activeSses.indexOf(res);
    if (index > -1) {
      activeSses.splice(index, 1);
    }
  });

return res;
});

router.post('/', async (req, res) => {
   info('Scan started (POST)');
   
   const startTime = Date.now();
   res.setHeader('Content-Type', 'application/json');

  if (!scanHasRun) {
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  res.json({ status: 'started' });

  try {
    orchestrator.abort();

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
    }
  }
});

router.get('/restart', (req, res) => {
  info('Manual scan restart triggered');
  scanHasRun = false;
  orchestrator.abort();
  return res.json({ status: 'restarted' });
});

router.get('/restart', (req, res) => {
  info('Manual scan restart triggered');
  scanHasRun = false;
  orchestrator.abort();
  return res.json({ status: 'restarted' });
});

export default router;
export { activeSses };
