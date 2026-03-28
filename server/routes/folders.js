import { Router } from 'express';
import { info, warn, error } from '../log.js';
import {
  addCustomPath,
  removeCustomPath,
  getCustomPaths,
  loadConfigFile,
} from '../services/settingsService.js';
import { loadConfigFile as loadProjectConfig } from '../services/configFileService.js';

const router = Router();

router.get('/', (req, res) => {
  const customPaths = getCustomPaths();
  const projectConfig = loadProjectConfig();

  res.json({
    settings: customPaths,
    config: projectConfig.folders.map(f => ({
      path: f.path,
      name: f.name,
    })),
    configFileFound: projectConfig.configFileFound,
  });
});

router.post('/', async (req, res) => {
  const { path } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'Path required' });
  }

  try {
    const { statSync } = await import('fs');
    const stats = statSync(path);

    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const updatedPaths = addCustomPath(path);
    info(`Added custom path: ${path}`);

    res.status(201).json({
      message: 'Folder added',
      folders: updatedPaths,
    });
  } catch (err) {
    error(`Failed to add path: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  const { path } = req.body;

  if (!path) {
    return res.status(400).json({ error: 'Path required' });
  }

  const updatedPaths = removeCustomPath(path);
  info(`Removed custom path: ${path}`);

  res.json({
    message: 'Folder removed',
    folders: updatedPaths,
  });
});

export default router;
