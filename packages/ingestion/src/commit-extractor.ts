import type { RepositoryProvider } from '@intentsync/repository-provider';
import type { CommitData, DiffData } from '@intentsync/core';
import type { Logger } from '@intentsync/logger';

/**
 * Extracts commits from the provider with optional date filtering.
 * Returns commits sorted newest-first.
 */
export async function extractCommits(
  provider: RepositoryProvider,
  log: Logger,
  options: { maxCommits?: number; since?: Date } = {},
): Promise<CommitData[]> {
  const { maxCommits = 500, since } = options;

  log.info({ maxCommits, since: since?.toISOString() }, 'Extracting commits');
  const commits = await provider.getCommits({ maxCount: maxCommits, since });
  log.info({ count: commits.length }, 'Commits extracted');

  return commits;
}

/**
 * Extracts diffs for a list of commits.
 * Returns a Map keyed by commit SHA → DiffData.
 *
 * Uses controlled concurrency to avoid overwhelming the provider.
 */
export async function extractDiffs(
  provider: RepositoryProvider,
  commits: CommitData[],
  log: Logger,
  options: { maxDiffCommits?: number } = {},
): Promise<Map<string, DiffData>> {
  const { maxDiffCommits = 100 } = options;
  const toFetch = commits.slice(0, maxDiffCommits);
  const diffs = new Map<string, DiffData>();

  log.info(
    { total: commits.length, fetching: toFetch.length },
    'Extracting diffs',
  );

  for (let i = 0; i < toFetch.length; i++) {
    const commit = toFetch[i]!;
    try {
      const diff = await provider.getDiff(commit.sha);
      diffs.set(commit.sha, diff);

      // Update the commit's filesChanged from the diff
      commit.filesChanged = diff.files.map((f) => f.path);
      commit.additions = diff.files.reduce((sum, f) => sum + f.additions, 0);
      commit.deletions = diff.files.reduce((sum, f) => sum + f.deletions, 0);

      // Progress log every 25 diffs
      if ((i + 1) % 25 === 0 || i === toFetch.length - 1) {
        log.info({ progress: `${i + 1}/${toFetch.length}` }, 'Diff progress');
      }
    } catch (error) {
      log.warn({ sha: commit.sha, err: error }, 'Failed to fetch diff, skipping');
    }
  }

  log.info({ count: diffs.size }, 'Diffs extracted');
  return diffs;
}
