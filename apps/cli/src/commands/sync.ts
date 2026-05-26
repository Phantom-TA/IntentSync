import { Command } from 'commander';
import { runIngestionPipeline } from '@intentsync/ingestion';
import { getConfig } from '@intentsync/core';
import type { ProviderConfig } from '@intentsync/repository-provider';
import {
  printHeader,
  printKeyValue,
  printSuccess,
  printError,
  printInfo,
  printDivider,
} from '../utils/output.js';

export const syncCommand = new Command('sync')
  .description('Ingest and synchronise a repository')
  .option('--repo <owner/repo>', 'GitHub repository to sync')
  .option('--local <path>', 'Local Git repository path to sync')
  .option('--incremental', 'Only sync commits since last sync', false)
  .option('--max-commits <number>', 'Maximum number of commits to fetch', '500')
  .option('--no-diffs', 'Skip diff extraction (faster)')
  .option('--max-diff-commits <number>', 'Max commits to fetch diffs for', '100')
  .action(
    async (opts: {
      repo?: string;
      local?: string;
      incremental: boolean;
      maxCommits: string;
      diffs: boolean;
      maxDiffCommits: string;
    }) => {
      if (!opts.repo && !opts.local) {
        printError('Provide either --repo <owner/repo> or --local <path>');
        process.exit(1);
      }

      try {
        const config = getConfig();

        // Build provider config
        let providerConfig: ProviderConfig;

        if (opts.repo) {
          const [owner, repo] = opts.repo.split('/');
          if (!owner || !repo) {
            printError('--repo must be in the format owner/repo');
            process.exit(1);
          }
          if (!config.GITHUB_TOKEN) {
            printError('GITHUB_TOKEN is required for GitHub repositories.');
            process.exit(1);
          }
          providerConfig = {
            type: 'github',
            owner,
            repo,
            token: config.GITHUB_TOKEN,
          };
        } else {
          providerConfig = {
            type: 'local',
            repoPath: opts.local!,
          };
        }

        const target = opts.repo ?? opts.local!;
        printHeader(`Syncing: ${target}`);
        printKeyValue('Mode', opts.incremental ? 'incremental' : 'full');
        printKeyValue('Max Commits', opts.maxCommits);
        printKeyValue('Fetch Diffs', opts.diffs ? 'yes' : 'no');
        printInfo('');
        printInfo('Running ingestion pipeline...');
        printDivider();

        // Run the pipeline
        const result = await runIngestionPipeline(providerConfig, {
          maxCommits: parseInt(opts.maxCommits, 10),
          fetchDiffs: opts.diffs,
          maxDiffCommits: parseInt(opts.maxDiffCommits, 10),
        });

        // Display results
        printHeader('Ingestion Complete');
        printKeyValue('Repository', `${result.metadata.owner}/${result.metadata.name}`);
        printKeyValue('Source', result.metadata.source);
        printKeyValue('Branch', result.metadata.defaultBranch);
        printDivider();
        printKeyValue('Commits', String(result.stats.commitCount));
        printKeyValue('Diffs Fetched', String(result.stats.diffCount));
        printKeyValue('Files in Tree', String(result.stats.fileCount));
        printKeyValue('Pull Requests', String(result.stats.prCount));
        printKeyValue('Issues', String(result.stats.issueCount));
        printKeyValue('Contributors', String(result.stats.contributorCount));
        printDivider();
        printKeyValue('Duration', `${(result.stats.durationMs / 1000).toFixed(2)}s`);

        // Show most recent commits
        if (result.commits.length > 0) {
          printInfo('');
          printHeader('Recent Commits (last 5)');
          for (const commit of result.commits.slice(0, 5)) {
            const sha = commit.sha.slice(0, 7);
            const date = commit.timestamp.toISOString().slice(0, 10);
            const msg =
              commit.message.length > 70
                ? commit.message.slice(0, 67) + '...'
                : commit.message;
            printKeyValue(`${sha} (${date})`, msg.split('\n')[0]!);
          }
        }

        // Show most changed files
        if (result.diffs.size > 0) {
          const fileCounts = new Map<string, number>();
          for (const diff of result.diffs.values()) {
            for (const file of diff.files) {
              fileCounts.set(file.path, (fileCounts.get(file.path) ?? 0) + 1);
            }
          }
          const topFiles = [...fileCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          if (topFiles.length > 0) {
            printInfo('');
            printHeader('Most Changed Files (top 5)');
            for (const [filePath, count] of topFiles) {
              printKeyValue(filePath, `${count} commits`);
            }
          }
        }

        printInfo('');
        printSuccess('Ingestion complete. Data ready for persistence (Phase 3).');
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    },
  );
