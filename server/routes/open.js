import { Router } from 'express';
import { execFile } from 'child_process';
import { info, warn } from '../log.js';
import { isPathWithinKnownLocations } from '../services/sharedState.js';
import { getCustomPaths } from '../services/settingsService.js';

const router = Router();

router.post('/', async (req, res) => {
  const { path: requestedPath } = req.body;

  if (!requestedPath) {
    return res.status(400).json({ error: 'Path required' });
  }

  try {
    const { statSync } = await import('fs');
    statSync(requestedPath);

    const normalizedPath = requestedPath.toLowerCase().replace(/\\/g, '/');
    const customPaths = getCustomPaths().map(p => p.toLowerCase().replace(/\\/g, '/'));
    
    if (!isPathWithinKnownLocations(requestedPath) && !customPaths.includes(normalizedPath)) {
      warn(`Path ${requestedPath} is outside known scan locations`);
      return res.status(400).json({ error: 'Path is outside known scan locations' });
    }

    const platform = process.platform;
    let command;
    
    switch (platform) {
      case 'win32':
        command = 'explorer.exe';
        break;
      case 'darwin':
        command = 'open';
        break;
      default:
        command = 'xdg-open';
    }

    execFile(command, [requestedPath], (err) => {
      if (err) {
        warn(`Failed to open folder: ${err.message}`);
        res.status(500).json({ error: err.message });
      } else {
        info(`Opened folder: ${requestedPath}`);
        res.json({ success: true });
      }
    });
  } catch (err) {
    warn(`Path validation error: ${err.message}`);
    res.status(400).json({ error: 'Path does not exist' });
  }
});

export default router;
