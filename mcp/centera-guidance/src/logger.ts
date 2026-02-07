import type { LogLevel } from './cliArgs.js';

export type Logger = {
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
};

export function createLogger(level: LogLevel): Logger {
  const shouldLog = (min: Exclude<LogLevel, 'silent'>): boolean => {
    const order: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3 };
    return order[level] >= order[min];
  };

  return {
    error: (message: string) => {
      if (!shouldLog('error')) return;
      console.error(message);
    },
    warn: (message: string) => {
      if (!shouldLog('warn')) return;
      console.error(message);
    },
    info: (message: string) => {
      if (!shouldLog('info')) return;
      console.error(message);
    },
  };
}

