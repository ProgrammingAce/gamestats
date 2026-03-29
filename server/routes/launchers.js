import { Router } from 'express';
import { getLauncherSettings, setLauncherSetting } from '../services/settingsService.js';

const router = Router();

router.get('/', (req, res) => {
  const settings = getLauncherSettings();
  res.json(settings);
});

router.post('/:name', (req, res) => {
  const { name } = req.params;
  const { enabled } = req.body;
  
  if (enabled !== undefined) {
    const settings = setLauncherSetting(name, enabled);
    res.json(settings);
  } else {
    res.status(400).json({ error: 'enabled field required' });
  }
});

router.get('/:name/folder', (req, res) => {
  const { name } = req.params;
  const folders = getLauncherSettings().folders || {};
  res.json({ folder: folders[name] || '' });
});

router.post('/:name/folder', (req, res) => {
  const { name } = req.params;
  const { folder } = req.body;
  
  if (folder !== undefined) {
    const settings = getLauncherSettings();
    settings.folders = settings.folders || {};
    settings.folders[name] = folder;
    
    import('../services/settingsService.js').then(({ saveSettings }) => {
      saveSettings(settings);
      res.json(settings);
    });
  } else {
    res.status(400).json({ error: 'folder field required' });
  }
});

router.delete('/:name/folder', (req, res) => {
  const { name } = req.params;
  const settings = getLauncherSettings();
  if (settings.folders) {
    delete settings.folders[name];
    
    import('../services/settingsService.js').then(({ saveSettings }) => {
      saveSettings(settings);
      res.json(settings);
    });
  } else {
    res.json(settings);
  }
});

export default router;
