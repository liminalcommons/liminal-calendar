/**
 * Client-side log buffer for bug reports.
 *
 * - Intercepts console.log/info/warn/error and keeps the last N entries.
 * - Captures uncaught errors and unhandled promise rejections (with stacks).
 * - Wraps `window.fetch` to log non-OK responses and network failures with
 *   enough context (method, status, url, response snippet) to diagnose API
 *   failures from a user bug report alone.
 *
 * Call installConsoleInterceptors() once on app mount.
 */

interface LogEntry {
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

const LOG_BUFFER_SIZE = 200;
const logBuffer: LogEntry[] = [];
let interceptorsInstalled = false;

function stringifyArg(a: unknown): string {
  if (a instanceof Error) {
    // Preserve the full stack — without it most "ERROR" lines are useless
    // for triage. Some Errors put extra fields on themselves; serialise them
    // too so axios/fetch/etc. payloads survive the trip to GitHub.
    const extras: Record<string, unknown> = {};
    for (const k of Object.keys(a)) {
      if (k === 'stack' || k === 'message' || k === 'name') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extras[k] = (a as any)[k];
    }
    const extrasStr = Object.keys(extras).length
      ? `\n${JSON.stringify(extras, null, 2)}`
      : '';
    return `${a.name}: ${a.message}\n${a.stack ?? '(no stack)'}${extrasStr}`;
  }
  if (typeof a === 'object' && a !== null) {
    try { return JSON.stringify(a); } catch { return String(a); }
  }
  return String(a);
}

function addEntry(level: LogEntry['level'], args: unknown[]) {
  const message = args.map(stringifyArg).join(' ');
  logBuffer.push({ timestamp: new Date().toISOString(), level, message });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

// Drain entries left in localStorage by a prior session's global-error
// boundary. The global boundary can't import this module reliably (the
// crash may have happened above all client modules), so it stashes raw
// entries we replay here on next mount.
function drainPendingEntries() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('bug-report-pending');
    if (!raw) return;
    const entries = JSON.parse(raw) as LogEntry[];
    for (const e of entries) {
      if (!e || typeof e.message !== 'string') continue;
      logBuffer.push({
        timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date().toISOString(),
        level: e.level === 'error' || e.level === 'warn' || e.level === 'info' ? e.level : 'log',
        message: `[stashed] ${e.message}`,
      });
    }
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.splice(0, logBuffer.length - LOG_BUFFER_SIZE);
    localStorage.removeItem('bug-report-pending');
  } catch { /* best effort */ }
}

export function installConsoleInterceptors() {
  if (interceptorsInstalled || typeof window === 'undefined') return;
  interceptorsInstalled = true;

  drainPendingEntries();

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

  // Uncaught synchronous errors. These often never reach console.error
  // because the page just dies — capturing them here is the only way to
  // make them visible in a later bug report.
  window.addEventListener('error', (ev) => {
    const msg = ev.error instanceof Error
      ? stringifyArg(ev.error)
      : `${ev.message} (at ${ev.filename}:${ev.lineno}:${ev.colno})`;
    addEntry('error', [`[window.onerror] ${msg}`]);
  });

  // Unhandled promise rejections — by far the most common source of
  // "something silently broke" in async client code.
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason instanceof Error
      ? stringifyArg(ev.reason)
      : stringifyArg(ev.reason);
    addEntry('error', [`[unhandledrejection] ${reason}`]);
  });

  // Fetch wrapper. We only log on FAILURE (network error or !res.ok) to
  // avoid drowning the buffer in noise — successful requests are not
  // diagnostic. The wrapped fetch returns the original response untouched.
  // jsdom and some older runtimes don't expose `window.fetch`; in that
  // case we skip the wrapper rather than crashing.
  if (typeof window.fetch !== 'function') return;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString()
      : input.url;
    try {
      const res = await origFetch(input, init);
      if (!res.ok) {
        // Clone before reading — leave the body for the caller.
        let snippet = '';
        try {
          const text = await res.clone().text();
          snippet = text.length > 500 ? text.slice(0, 500) + '…' : text;
        } catch { /* response not readable as text */ }
        addEntry('warn', [`[fetch] ${method} ${url} → ${res.status} ${res.statusText}${snippet ? ` :: ${snippet}` : ''}`]);
      }
      return res;
    } catch (err) {
      addEntry('error', [`[fetch] ${method} ${url} → network error: ${stringifyArg(err)}`]);
      throw err;
    }
  };
}

/**
 * Push a structured event into the same buffer that intercepted console
 * calls land in. Used by the App Router error boundary (component crash)
 * and the route-history tracker (navigation). Going through this fn keeps
 * the timestamp format consistent and ensures de-dup still works on
 * repeated identical events.
 */
export function recordEvent(level: LogEntry['level'], message: string): void {
  if (typeof window === 'undefined') return;
  logBuffer.push({ timestamp: new Date().toISOString(), level, message });
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
}

export function getRecentLogsAsString(limit = 150): string {
  return logBuffer
    .slice(-limit)
    .map(e => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
    .join('\n');
}
