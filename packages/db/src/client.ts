import { PrismaClient } from '@prisma/client';

let _client: PrismaClient | null = null;

/**
 * Returns a singleton PrismaClient instance.
 * Re-uses the same client across the entire application lifetime.
 */
export function getDbClient(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }
  return _client;
}

/**
 * Gracefully disconnect the Prisma client.
 * Call this during process shutdown.
 */
export async function disconnectDb(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}
