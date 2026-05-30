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

      let isShuttingDown = false;
      const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        printInfo('\nShutting down workers gracefully...');

        const forceExitTimeout = setTimeout(() => {
          printError('Force exiting worker process (shutdown timeout)...');
          process.exit(1);
        }, 5000);

        try {
          await Promise.all(workers.map((w) => w.close()));
          printSuccess('All workers closed. Goodbye!');
          clearTimeout(forceExitTimeout);
          process.exit(0);
        } catch (error) {
          printError(`Error during worker shutdown: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (error) {
      printError(`Failed to start workers: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  });
