import { Command } from 'commander';
import {
  printHeader,
  printKeyValue,
  printSuccess,
  printError,
  printInfo,
  printWarning,
  printDivider,
} from '../utils/output.js';
import { getDbClient, disconnectDb } from '@intentsync/db';
import { analyzeFile, analyzeDeveloper, analyzeModule } from '@intentsync/analysis';
import chalk from 'chalk';

export const inspectCommand = new Command('inspect')
  .description('Inspect repository entities (file, module, developer)');

// ── Step 1: Helper to resolve repoId from DB ───────────────────────
async function resolveRepoId(
  db: ReturnType<typeof getDbClient>,
  opts: { repo?: string; local?: string },
): Promise<string | null> {
  if (opts.repo) {
    const [owner, name] = opts.repo.split('/');
    if (!owner || !name) {
      printError('--repo must be in the format owner/repo');
      process.exit(1);
    }
    const repo = await db.repository.findUnique({
      where: { owner_name: { owner, name } },
      select: { id: true },
    });
    return repo?.id ?? null;
  } else if (opts.local) {
    const localName = opts.local.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
    const repo = await db.repository.findFirst({
      where: { name: localName, source: 'local' },
      select: { id: true },
      orderBy: { lastSyncedAt: 'desc' },
    });
    return repo?.id ?? null;
  }
  return null;
}

// ── Inspect File Command ───────────────────────────────────────────
inspectCommand
  .command('file <path>')
  .description('Show history and instability analysis for a file')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--local <repoPath>', 'Local repository path')
  .action(async (filePath: string, opts: { repo?: string; local?: string }) => {
    if (!opts.repo && !opts.local) {
      printError('Provide either --repo <owner/repo> or --local <path>');
      process.exit(1);
    }

    const db = getDbClient();
    try {
      const repoId = await resolveRepoId(db, opts);
      if (!repoId) {
        printError(
          `Repository "${opts.repo ?? opts.local}" is not indexed yet. Please run sync first.`,
        );
        await disconnectDb();
        process.exit(1);
      }

      printInfo(`Analyzing file diagnostics: ${filePath}...`);
      const fileIntel = await analyzeFile(db, repoId, filePath);

      if (!fileIntel) {
        printWarning(`File path "${filePath}" was not found in database for this repository.`);
        printWarning('Ensure the path is correct relative to the repository root.');
        await disconnectDb();
        process.exit(0);
      }

      printHeader('File Code Intelligence');
      printKeyValue('File Path', fileIntel.filePath);
      printKeyValue('Total Revisions', String(fileIntel.totalCommits));
      printKeyValue(
        'Cumulative Churn',
        `${fileIntel.totalChurn} lines (+${fileIntel.additions}/-${fileIntel.deletions})`,
      );
      printKeyValue('Last Modified', `${fileIntel.daysSinceLastModification} days ago (${fileIntel.lastModifiedAt.toISOString().slice(0, 10)})`);

      // Colorize ratings
      let ratingColor = chalk.green;
      if (fileIntel.rating === 'Highly Volatile') {
        ratingColor = chalk.bold.red;
      } else if (fileIntel.rating === 'Active') {
        ratingColor = chalk.yellow;
      } else if (fileIntel.rating === 'Moderate') {
        ratingColor = chalk.cyan;
      }

      printKeyValue(
        'Volatility Rating',
        `${ratingColor(fileIntel.rating)} (Score: ${fileIntel.instabilityScore}/100)`,
      );

      if (fileIntel.topContributors.length > 0) {
        printDivider();
        console.log(chalk.bold.gray('Top Contributors (by Commit Count):'));
        for (const c of fileIntel.topContributors) {
          console.log(
            `  ${chalk.cyan('@' + c.login.padEnd(20))} ${chalk.bold(c.commitCount)} commits (${chalk.gray(c.ownershipPercent + '% ownership')})`,
          );
        }
      }
      printSuccess('File analysis complete.');
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    } finally {
      await disconnectDb();
    }
  });

// ── Inspect Module Command ─────────────────────────────────────────
inspectCommand
  .command('module <dir>')
  .description('Show module-level intelligence for a directory')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--local <repoPath>', 'Local repository path')
  .action(async (dir: string, opts: { repo?: string; local?: string }) => {
    if (!opts.repo && !opts.local) {
      printError('Provide either --repo <owner/repo> or --local <path>');
      process.exit(1);
    }

    const db = getDbClient();
    try {
      const repoId = await resolveRepoId(db, opts);
      if (!repoId) {
        printError(
          `Repository "${opts.repo ?? opts.local}" is not indexed yet. Please run sync first.`,
        );
        await disconnectDb();
        process.exit(1);
      }

      printInfo(`Analyzing module health recursively: ${dir}...`);
      const moduleIntel = await analyzeModule(db, repoId, dir);

      if (!moduleIntel) {
        printWarning(`No matching files or module found under path: "${dir}"`);
        await disconnectDb();
        process.exit(0);
      }

      printHeader('Module Health & Complexity Diagnostics');
      printKeyValue('Module Directory', moduleIntel.modulePath);
      printKeyValue('Recursive Files', String(moduleIntel.totalFiles));
      printKeyValue('Cumulative Commits', String(moduleIntel.totalCommits));
      printKeyValue('Cumulative Churn', `${moduleIntel.totalChurn} lines`);
      printKeyValue('Active Contributors', String(moduleIntel.activeContributorsCount));

      // Colorize health
      let healthColor = chalk.green;
      if (moduleIntel.moduleHealth === 'Critical Volatility') {
        healthColor = chalk.bold.red;
      } else if (moduleIntel.moduleHealth === 'Needs Review') {
        healthColor = chalk.yellow;
      }

      printKeyValue(
        'Module Health State',
        `${healthColor(moduleIntel.moduleHealth)} (Average Instability: ${moduleIntel.averageInstabilityScore}/100)`,
      );

      if (moduleIntel.topOwners.length > 0) {
        printDivider();
        console.log(chalk.bold.gray('Top Module Directory Owners:'));
        for (const owner of moduleIntel.topOwners) {
          console.log(
            `  ${chalk.cyan('@' + owner.login.padEnd(20))} ${chalk.bold(owner.ownershipPercent + '%')} folder share`,
          );
        }
      }
      printSuccess('Module analysis complete.');
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    } finally {
      await disconnectDb();
    }
  });

// ── Inspect Developer Command ──────────────────────────────────────
inspectCommand
  .command('developer <login>')
  .description('Show developer contribution analysis')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--local <repoPath>', 'Local repository path')
  .action(async (login: string, opts: { repo?: string; local?: string }) => {
    if (!opts.repo && !opts.local) {
      printError('Provide either --repo <owner/repo> or --local <path>');
      process.exit(1);
    }

    const db = getDbClient();
    try {
      const repoId = await resolveRepoId(db, opts);
      if (!repoId) {
        printError(
          `Repository "${opts.repo ?? opts.local}" is not indexed yet. Please run sync first.`,
        );
        await disconnectDb();
        process.exit(1);
      }

      printInfo(`Analyzing developer ownership profile: ${login}...`);
      const devIntel = await analyzeDeveloper(db, repoId, login);

      if (!devIntel) {
        printWarning(`Developer "@${login}" has no recorded contributions in this repository.`);
        await disconnectDb();
        process.exit(0);
      }

      printHeader('Developer Contribution Diagnostics');
      printKeyValue('Developer Profile', `@${devIntel.login}`);
      printKeyValue(
        'Commit Share Index',
        `${devIntel.totalCommits} commits (${devIntel.commitSharePercent}% repo share)`,
      );
      printKeyValue(
        'Churn Share Index',
        `${devIntel.totalChurn} lines (${devIntel.churnSharePercent}% repo share)`,
      );

      // Colorize ownership
      let ownerColor = chalk.green;
      if (devIntel.overallOwnershipPercent > 40) {
        ownerColor = chalk.bold.red; // Heavy dependency/Key-person risk
      } else if (devIntel.overallOwnershipPercent > 15) {
        ownerColor = chalk.yellow;
      }

      printKeyValue(
        'Overall Knowledge Share',
        `${ownerColor(devIntel.overallOwnershipPercent + '%')} ownership`,
      );

      if (devIntel.topOwnedFiles.length > 0) {
        printDivider();
        console.log(chalk.bold.gray('Top Owned Code Files / Hotspots:'));
        for (const file of devIntel.topOwnedFiles) {
          console.log(
            `  ${chalk.bold(String(file.authorSharePercent).padStart(3) + '%')} ${chalk.gray(file.filePath)}`,
          );
        }
      }
      printSuccess('Developer analysis complete.');
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    } finally {
      await disconnectDb();
    }
  });
