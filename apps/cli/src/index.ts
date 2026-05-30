#!/usr/bin/env node
import { Command } from 'commander';
import { repoCommand } from './commands/repo.js';
import { syncCommand } from './commands/sync.js';
import { askCommand } from './commands/ask.js';
import { inspectCommand } from './commands/inspect.js';
import { statusCommand } from './commands/status.js';
import { workerCommand } from './commands/worker.js';
import { printError } from './utils/output.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('intentsync')
  .description(
    chalk.bold.cyan('IntentSync') +
    ' — AI-powered repository intelligence and engineering memory',
  )
  .version('0.1.4');

program.addCommand(repoCommand);
program.addCommand(syncCommand);
program.addCommand(askCommand);
program.addCommand(inspectCommand);
program.addCommand(statusCommand);
program.addCommand(workerCommand);

program.parseAsync(process.argv).catch((error: unknown) => {
  printError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
