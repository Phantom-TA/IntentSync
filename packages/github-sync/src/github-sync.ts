import type { RepositoryProvider } from '@intentsync/repository-provider';
import type { PRData, IssueData, ContributorData } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';

export interface GitHubSyncResult {
  pullRequests: PRData[];
  issues: IssueData[];
  contributors: ContributorData[];
}

/**
 * Extracts GitHub-specific metadata (PRs, issues, contributors) from a provider.
 * Gracefully returns empty arrays if the provider doesn't support these operations
 * (e.g. LocalGitProvider).
 */
export async function syncGitHubMetadata(
  provider: RepositoryProvider,
  repoId: string,
): Promise<GitHubSyncResult> {
  const log = createLogger('github-sync', repoId);

  const result: GitHubSyncResult = {
    pullRequests: [],
    issues: [],
    contributors: [],
  };

  // PRs
  if (provider.getPullRequests) {
    log.info('Fetching pull requests...');
    try {
      result.pullRequests = await provider.getPullRequests();
      log.info({ count: result.pullRequests.length }, 'Pull requests fetched');
    } catch (error) {
      log.warn({ err: error }, 'Failed to fetch pull requests, skipping');
    }
  } else {
    log.debug('Provider does not support pull requests, skipping');
  }

  // Issues
  if (provider.getIssues) {
    log.info('Fetching issues...');
    try {
      result.issues = await provider.getIssues();
      log.info({ count: result.issues.length }, 'Issues fetched');
    } catch (error) {
      log.warn({ err: error }, 'Failed to fetch issues, skipping');
    }
  } else {
    log.debug('Provider does not support issues, skipping');
  }

  // Contributors
  if (provider.getContributors) {
    log.info('Fetching contributors...');
    try {
      result.contributors = await provider.getContributors();
      log.info({ count: result.contributors.length }, 'Contributors fetched');
    } catch (error) {
      log.warn({ err: error }, 'Failed to fetch contributors, skipping');
    }
  } else {
    log.debug('Provider does not support contributors, skipping');
  }

  return result;
}
