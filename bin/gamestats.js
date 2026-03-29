#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';
import { info, warn, error } from '../server/log.js';
import { getPort, setPort } from '../server/services/settingsService.js';
import { app, setNoAutoShutdown, startServer } from '../server/index.js';
import { loadConfigFile } from '../server/services/configFileService.js';
import { getCustomConfigPath, setCustomConfigPath } from '../server/services/sharedState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
let port = getPort();
let configPath = null;
let openBrowser = true;
let autoShutdown = true;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--port':
    case '-p':
      port = parseInt(args[++i], 10);
      if (isNaN(port)) {
        error('Invalid port number');
        process.exit(1);
      }
      setPort(port);
      break;
    case '--config':
      configPath = args[++i];
      break;
    case '--no-open':
      openBrowser = false;
      break;
    case '--no-auto-shutdown':
      autoShutdown = false;
      setNoAutoShutdown(true);
      break;
    case '--help':
    case '-h':
      console.log(`
Usage: gamestats [options]

Options:
  --port <number>       Port to run on (default: ${port})
  --no-open             Don't auto-open the browser
  --no-auto-shutdown    Keep the server running even when no clients are connected
  --config <path>       Path to gamestats.config.json file
  --help                Show help
      `);
      process.exit(0);
  }
}

if (configPath) {
  setCustomConfigPath(configPath);
}

info(`GameStats running on http://127.0.0.1:${port}`);

if (configPath) {
  info(`Using custom config file: ${configPath}`);
}

startServer();

if (openBrowser) {
  open(`http://127.0.0.1:${port}`)
    .catch(err => {
      warn(`Browser open failed: ${err.message}`);
      info(`Open http://127.0.0.1:${port} in your browser`);
    });
} else {
  info(`Open http://127.0.0.1:${port} in your browser`);
}
