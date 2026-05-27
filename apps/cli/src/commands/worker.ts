import { Command } from 'commander';
import { printHeader, printInfo, printSuccess, printError } from '../utils/output.js';
import chalk from 'chalk';

export const workerCommand = new Command('worker')
  .description('Start the background job queue workers')
  .action(async () => {
    printHeader('IntentSync — Background Queue Worker');
    printInfo('Connecting to Redis and booting up workers...');

    try {
      const { startWorkers } = await import('@intentsync/queue');
      const workers = startWorkers();

      printSuccess('✓ 5 Background Workers online and listening for tasks:');
      printInfo('  - repo.ingest');
      printInfo('  - embeddings.generate');
      printInfo('  - ai.summarize');
      printInfo('  - graph.build');
      printInfo('  - repo.sync');
      printInfo('');
      printInfo(chalk.dim('Press Ctrl+C to terminate workers and exit...'));

      // Keep process alive
      process.on('SIGINT', async () => {
        printInfo('\nShutting down workers gracefully...');
        await Promise.all(workers.map((w) => w.close()));
        printSuccess('All workers closed. Goodbye!');
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        printInfo('\nShutting down workers gracefully...');
        await Promise.all(workers.map((w) => w.close()));
        printSuccess('All workers closed. Goodbye!');
        process.exit(0);
      });
    } catch (error) {
      printError(`Failed to start workers: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
