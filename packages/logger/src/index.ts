import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';
const logLevel = process.env['LOG_LEVEL'] ?? 'info';

export const logger = pino({
  level: logLevel,
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export type Logger = pino.Logger;

/**
 * Create a child logger scoped to a specific package + optional repoId.
 * All log calls from packages should use this pattern.
 *
 * @example
 * const log = createLogger('ingestion', repoId);
 * log.info({ commitCount }, 'Commits extracted');
 */
export function createLogger(packageName: string, repoId?: string): pino.Logger {
  return logger.child({
    package: packageName,
    ...(repoId ? { repoId } : {}),
  });
}
