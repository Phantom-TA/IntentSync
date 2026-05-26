import { Command } from 'commander';
import { printInfo, printHeader, printKeyValue } from '../utils/output.js';

export const syncCommand = new Command('sync')
  .description('Ingest and synchronise a repository')
  .option('--repo <owner/repo>', 'GitHub repository to sync')
  .option('--local <path>', 'Local Git repository path to sync')
  .option('--incremental', 'Only sync commits since last sync', false)
  .action((opts: { repo?: string; local?: string; incremental: boolean }) => {
    if (!opts.repo && !opts.local) {
      console.error('Provide either --repo <owner/repo> or --local <path>');
      process.exit(1);
    }

    const target = opts.repo ?? opts.local;
    const mode = opts.incremental ? 'incremental' : 'full';

    printHeader(`Sync — ${mode.toUpperCase()}`);
    printKeyValue('Target', target ?? '');
    printKeyValue('Mode', mode);
    printInfo('Ingestion pipeline coming in Phase 2.');
    printInfo('Will extract: commits, diffs, file tree, PRs, issues.');
  });
