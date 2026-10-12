// Minimal structured logger. Console-based; wire a sink (e.g. pino/file) here
// in production without touching call sites.
type Level = 'info' | 'warn' | 'error' | 'debug';

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const extra = meta ? ` ${JSON.stringify(meta)}` : '';
  if (level === 'error') console.error(line + extra);
  else if (level === 'warn') console.warn(line + extra);
  else console.log(line + extra);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
};
