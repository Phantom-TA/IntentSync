import {
  createProvider,
  type ProviderConfig,
} from '@intentsync/repository-provider';
import { syncGitHubMetadata } from '@intentsync/github-sync';
import { createLogger } from '@intentsync/logger';
import { extractCommits, extractDiffs } from './commit-extractor.js';
import { extractFileTree } from './file-tree-extractor.js';
import type { IngestionResult, IngestionOptions } from './types.js';

/**
 * Runs the full sequential ingestion pipeline for a repository.
 *
 * Pipeline steps:
 *   1. Resolve provider (GitHub or LocalGit)
 *   2. Fetch repository metadata
 *   3. Extract commits
 *   4. Extract diffs for each commit
 *   5. Extract file tree at HEAD
 *   6. Fetch GitHub metadata (PRs, issues, contributors) if applicable
 *   7. Compile and return IngestionResult
 *
 * No AI summarisation, no embedding, no database writes.
 * Those happen in later phases.
 */
export async function runIngestionPipeline(
  providerConfig: ProviderConfig,
  options: IngestionOptions = {},
): Promise<IngestionResult> {
  const startTime = Date.now();
  const log = createLogger('ingestion');

  // ── Step 1: Create provider ──────────────────────────────────────
  log.info({ type: providerConfig.type }, 'Initialising repository provider');
  const provider = createProvider(providerConfig, log);

  // ── Step 2: Repository metadata ──────────────────────────────────
  log.info('Fetching repository metadata');
  const metadata = await provider.getMetadata();
  const repoLog = createLogger('ingestion', metadata.id);
  repoLog.info(
    { owner: metadata.owner, name: metadata.name, source: metadata.source },
    'Repository resolved',
  );

  // ── Step 3: Extract commits ──────────────────────────────────────
  const commits = await extractCommits(provider, repoLog, {
    maxCommits: options.maxCommits,
    since: options.since,
  });

  // ── Step 4: Extract diffs ────────────────────────────────────────
  const fetchDiffs = options.fetchDiffs ?? true;
  let diffs = new Map<string, import('@intentsync/core').DiffData>();

  if (fetchDiffs) {
    diffs = await extractDiffs(provider, commits, repoLog, {
      maxDiffCommits: options.maxDiffCommits,
    });
  } else {
    repoLog.info('Diff extraction skipped');
  }

  // ── Step 5: Extract file tree ────────────────────────────────────
  const fileTree = await extractFileTree(provider, repoLog);

  // ── Step 6: GitHub metadata (PRs, issues, contributors) ──────────
  const githubData = await syncGitHubMetadata(provider, metadata.id);

  // ── Step 7: Compile result ───────────────────────────────────────
  const durationMs = Date.now() - startTime;

  const result: IngestionResult = {
    metadata,
    commits,
    diffs,
    fileTree,
    pullRequests: githubData.pullRequests,
    issues: githubData.issues,
    contributors: githubData.contributors,
    stats: {
      commitCount: commits.length,
      diffCount: diffs.size,
      fileCount: fileTree.length,
      prCount: githubData.pullRequests.length,
      issueCount: githubData.issues.length,
      contributorCount: githubData.contributors.length,
      durationMs,
    },
  };

  repoLog.info(
    {
      commits: result.stats.commitCount,
      diffs: result.stats.diffCount,
      files: result.stats.fileCount,
      prs: result.stats.prCount,
      issues: result.stats.issueCount,
      contributors: result.stats.contributorCount,
      durationMs: result.stats.durationMs,
    },
    'Ingestion pipeline complete',
  );

  return result;
}
