/**
 * Client-side log buffer for bug reports.
 * Intercepts console.log/info/warn/error and keeps the last N entries.
 * Call installConsoleInterceptors() once on app mount.
 */

interface LogEntry {
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

const LOG_BUFFER_SIZE = 150;
const logBuffer: LogEntry[] = [];
let interceptorsInstalled = false;

function addEntry(level: LogEntry['level'], args: unknown[]) {
  const message = args
    .map(a => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');

  logBuffer.push({ timestamp: new Date().toISOString(), level, message });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

export function installConsoleInterceptors() {
  if (interceptorsInstalled || typeof window === 'undefined') return;
  interceptorsInstalled = true;

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log   = (...args: unknown[]) => { orig.log(...args);   addEntry('log',   args); };
  console.info  = (...args: unknown[]) => { orig.info(...args);  addEntry('info',  args); };
  console.warn  = (...args: unknown[]) => { orig.warn(...args);  addEntry('warn',  args); };
  console.error = (...args: unknown[]) => { orig.error(...args); addEntry('error', args); };
}

export function getRecentLogsAsString(limit = 100): string {
  return logBuffer
    .slice(-limit)
    .map(e => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
    .join('\n');
}
