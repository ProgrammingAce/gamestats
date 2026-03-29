import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { info, warn, error } from './log.js';
import scanRoutes, { activeSses } from './routes/scan.js';
import foldersRoutes from './routes/folders.js';
import openRoutes from './routes/open.js';
import launcherRoutes from './routes/launchers.js';
import { getPort, setPort, getCustomPaths } from './services/settingsService.js';
import { loadConfigFile } from './services/configFileService.js';
import { updateScanResults, isPathWithinKnownLocations, setCustomConfigPath, normalizePath, scanResults } from './services/sharedState.js';
import { getCustomConfigPath } from './services/sharedState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
let customConfigPath = null;

app.use(express.json());
app.use(express.static(join(__dirname, '../public')));

let connectedClients = 0;
let idleTimer = null;
let noAutoShutdown = false;

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

app.use('/api/scan', scanRoutes);
app.use('/api/folders', foldersRoutes);
app.use('/api/open', openRoutes);
app.use('/api/launchers', launcherRoutes);

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  info('Client connected, resetting idle timer');
}

function startIdleTimer() {
  idleTimer = setTimeout(() => {
    info('No active clients — shutting down');
    server.close();
    process.exit(0);
  }, 60000);
}

let server;

function startServer() {
  server = app.listen(getPort(), '127.0.0.1', () => {
    info(`Server listening on http://127.0.0.1:${getPort()}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      error(`Port ${getPort()} is in use. Try using --port flag to specify a different port.`);
      process.exit(1);
    }
    error(`Server error: ${err.message}`);
    process.exit(1);
  });
}

export { startServer };

process.on('SIGINT', () => {
  info('SIGINT received, shutting down...');
  if (idleTimer) clearTimeout(idleTimer);
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  info('SIGTERM received, shutting down...');
  if (idleTimer) clearTimeout(idleTimer);
  server.close(() => {
    process.exit(0);
  });
});

export { app, server, noAutoShutdown, setNoAutoShutdown, getCustomPaths, activeSses, getCustomConfigPath };

function setNoAutoShutdown(value) {
  noAutoShutdown = value;
}
