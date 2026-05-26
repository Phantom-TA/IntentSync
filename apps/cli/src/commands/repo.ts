import { Command } from 'commander';
import { printSuccess, printError, printHeader, printKeyValue, printInfo } from '../utils/output.js';
import { createProvider } from '@intentsync/repository-provider';
import { createLogger } from '@intentsync/logger';
import { getConfig } from '@intentsync/core';

export const repoCommand = new Command('repo')
  .description('Manage tracked repositories');

repoCommand
  .command('add')
  .description('Register a repository for tracking')
  .option('--github <owner/repo>', 'GitHub repository (e.g. vercel/next.js)')
  .option('--local <path>', 'Local Git repository path')
  .action(async (opts: { github?: string; local?: string }) => {
    if (!opts.github && !opts.local) {
      printError('Provide either --github <owner/repo> or --local <path>');
      process.exit(1);
    }

    const log = createLogger('cli:repo');

    try {
      const config = getConfig();

      if (opts.github) {
        const [owner, repo] = opts.github.split('/');
        if (!owner || !repo) {
          printError('--github must be in the format owner/repo');
          process.exit(1);
        }
        if (!config.GITHUB_TOKEN) {
          printError('GITHUB_TOKEN is not set. Required for GitHub repositories.');
          process.exit(1);
        }

        printInfo(`Verifying GitHub repository: ${opts.github}`);
        const provider = createProvider(
          { type: 'github', owner, repo, token: config.GITHUB_TOKEN },
          log,
        );
        const metadata = await provider.getMetadata();

        printHeader('Repository Added');
        printKeyValue('Source', 'GitHub');
        printKeyValue('Owner', metadata.owner);
        printKeyValue('Name', metadata.name);
        printKeyValue('Branch', metadata.defaultBranch);
        printKeyValue('URL', metadata.url);
        if (metadata.description) printKeyValue('Description', metadata.description);
        printSuccess(`Repository ${metadata.owner}/${metadata.name} registered.`);
        printInfo('Run: intentsync sync --repo ' + opts.github);
      }

      if (opts.local) {
        const provider = createProvider({ type: 'local', repoPath: opts.local }, log);
        const metadata = await provider.getMetadata();

        printHeader('Repository Added');
        printKeyValue('Source', 'Local Git');
        printKeyValue('Path', opts.local);
        printKeyValue('Name', metadata.name);
        printKeyValue('Branch', metadata.defaultBranch);
        printSuccess(`Local repository "${metadata.name}" registered.`);
        printInfo('Run: intentsync sync --local ' + opts.local);
      }
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
      log.error({ error }, 'repo add failed');
      process.exit(1);
    }
  });

repoCommand
  .command('list')
  .description('List all tracked repositories')
  .action(() => {
    printHeader('Tracked Repositories');
    printInfo('Database integration coming in Phase 3.');
    printInfo('Once synced, repositories will be listed here.');
  });

repoCommand
  .command('remove')
  .description('Remove a tracked repository')
  .option('--github <owner/repo>', 'GitHub repository to remove')
  .option('--local <path>', 'Local repository path to remove')
  .action((opts: { github?: string; local?: string }) => {
    const target = opts.github ?? opts.local ?? '(none)';
    printInfo(`Remove repository: ${target} — coming in Phase 3 (DB integration).`);
  });
