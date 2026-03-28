const prefix = '[gamestats]';

function formatTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function log(level, message) {
  const timestamp = formatTime();
  const prefixWithTime = `${prefix} ${timestamp}`;
  const colorCode = {
    info: '\x1B[36m',
    warn: '\x1B[33m',
    error: '\x1B[31m',
  };
  const reset = '\x1B[0m';

  const levelStr = level.toUpperCase().padEnd(5);
  const formattedMessage = `${prefixWithTime} ${levelStr} ${message}`;

  if (level === 'info') {
    console.log(formattedMessage);
  } else if (level === 'warn') {
    console.warn(formattedMessage);
  } else if (level === 'error') {
    console.error(formattedMessage);
  }
}

export const info = (message) => log('info', message);
export const warn = (message) => log('warn', message);
export const error = (message) => log('error', message);
