import { Command } from 'commander';
import { printHeader, printKeyValue, printSuccess, printError, printInfo } from '../utils/output.js';

export const statusCommand = new Command('status')
  .description('Check system health and service connectivity')
  .action(async () => {
    printHeader('IntentSync — System Status');

    // PostgreSQL check
    try {
      const { getConfig } = await import('@intentsync/core');
      const config = getConfig();
      printKeyValue('Config', '✓ Environment validated');
      printKeyValue('DB URL', config.DATABASE_URL.replace(/:\/\/.*@/, '://***@'));
      printKeyValue('ChromaDB', config.CHROMA_HOST);
      printKeyValue('Gemini Model', config.GEMINI_CHAT_MODEL);
      printKeyValue('GitHub Token', config.GITHUB_TOKEN ? '✓ Set' : '✗ Not set');
      printKeyValue('Neo4j URI', config.NEO4J_URI ?? '(Phase 6 — not configured)');
      printSuccess('Configuration loaded successfully.');

      // Redis & BullMQ checks
      printInfo('\nChecking Queue Infrastructure...');
      try {
        const { getSharedRedisConnection, closeSharedRedisConnection } = await import('@intentsync/queue');
        const { QUEUE_NAMES } = await import('@intentsync/core');
        const { Queue } = await import('bullmq');

        printKeyValue('Redis Host', `${config.REDIS_HOST}:${config.REDIS_PORT}`);

        const redis = getSharedRedisConnection();
        await redis.ping();
        printKeyValue('Redis Status', '✓ Connected');

        printInfo('\nBullMQ Job Queues:');
        for (const queueName of Object.values(QUEUE_NAMES)) {
          const queue = new Queue(queueName, { connection: redis });
          const counts = await queue.getJobCounts('active', 'completed', 'failed', 'waiting', 'delayed');
          printKeyValue(
            `  ${queueName}`,
            `waiting: ${counts.waiting} | active: ${counts.active} | completed: ${counts.completed} | failed: ${counts.failed}`
          );
          await queue.close();
        }
        await closeSharedRedisConnection();
      } catch (redisError) {
        printKeyValue('Redis Status', '✗ Connection failed (Redis may be offline)');
      }
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
      printError('Fix the above environment errors before proceeding.');
      process.exit(1);
    }
  });
