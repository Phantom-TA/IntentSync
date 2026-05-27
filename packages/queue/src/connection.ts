import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { getConfig } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';

const log = createLogger('queue:connection');

let sharedConnection: Redis | null = null;

/**
 * Creates a new Redis connection configured for BullMQ.
 * Note: BullMQ requires maxRetriesPerRequest: null.
 */
export function createRedisConnection(options?: RedisOptions): Redis {
  const config = getConfig();
  const host = config.REDIS_HOST;
  const port = config.REDIS_PORT;
  const password = config.REDIS_PASSWORD;

  log.debug({ host, port }, 'Creating Redis connection instance');

  return new Redis({
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
    // Add safety reconnect options
    lazyConnect: true,
    ...options,
  });
}

/**
 * Returns a shared Redis connection instance.
 * Useful for Queue instances to avoid opening many sockets.
 */
export function getSharedRedisConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
    // Connect eagerly
    sharedConnection.connect().catch((err: unknown) => {
      log.error({ err }, 'Failed to connect to shared Redis instance');
    });
  }
  return sharedConnection;
}

/**
 * Closes the shared connection if it exists.
 */
export async function closeSharedRedisConnection(): Promise<void> {
  if (sharedConnection) {
    log.debug('Closing shared Redis connection');
    await sharedConnection.quit();
    sharedConnection = null;
  }
}
