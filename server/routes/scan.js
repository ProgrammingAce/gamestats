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
  } else {
    res.write('event: progress\ndata: {"phase":"scanning","launcher":"Existing scan","gamesFound":0}\n\n');
    res.end();
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

router.post('/', (req, res) => {
  info('Scan reset (POST)');
  orchestrator.abort();
  scanHasRun = false;
  res.json({ status: 'started' });
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

router.post('/browse-folder', async (req, res) => {
  const { launcher } = req.body;
  info(`Browse folder requested for launcher: ${launcher}`);
  
  const { spawn } = await import('child_process');
  
  let cmd, args, options;
  
  if (process.platform === 'win32') {
    cmd = 'powershell.exe';
    args = [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Select folder for ${launcher}'; $dialog.RootFolder = 'Desktop'; if ($dialog.ShowDialog() -eq 'OK') { Write-Host $dialog.SelectedPath }`
    ];
    options = { shell: true };
    info(`Windows: Using ${cmd} with ${args.length} args`);
  } else if (process.platform === 'darwin') {
    cmd = 'osascript';
    args = [
      '-e',
      `try
        set chosenFolder to choose folder with prompt "Select folder for ${launcher}:"
        POSIX path of chosenFolder
      on error
        ""
      end try`
    ];
    options = {};
    info(`macOS: Using ${cmd}`);
  } else {
    cmd = 'zenity';
    args = ['--file-selection', '--directory', '--title=Select folder for ' + launcher];
    options = {};
    info(`Linux: Using ${cmd}`);
  }
  
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    const proc = spawn(cmd, args, options);
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      info(`stdout: ${data.toString().trim()}`);
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      info(`stderr: ${data.toString().trim()}`);
    });
    
    proc.on('close', (code) => {
      info(`Process closed with code: ${code}`);
      if (stdout.trim()) {
        info(`Sending folder: ${stdout.trim()}`);
        resolve(res.json({ folder: stdout.trim() }));
      } else {
        info(`Sending empty folder, error: ${code || 'cancelled'}`);
        resolve(res.json({ folder: '', error: code || 'cancelled' }));
      }
    });
    
    proc.on('error', (err) => {
      info(`Process error: ${err.message}`);
      resolve(res.json({ folder: '', error: err.message }));
    });
  });
});

export default router;
export { activeSses };
