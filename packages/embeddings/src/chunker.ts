import { chunkText, shortSha, type CommitData, type PRData, type IssueData } from '@intentsync/core';

export interface ChunkedEntity {
  entityType: 'commit' | 'pull_request' | 'issue' | 'file';
  entityId: string;
  chunks: string[];
  metadata: Record<string, string | number | boolean>;
}

/**
 * Chunks commit data into embeddable text fragments.
 */
export function chunkCommit(commit: CommitData, repoId: string): ChunkedEntity {
  const text = [
    `Commit ${shortSha(commit.sha)} by ${commit.authorLogin} on ${commit.timestamp.toISOString().slice(0, 10)}`,
    commit.message,
    commit.filesChanged.length > 0
      ? `Files changed: ${commit.filesChanged.join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    entityType: 'commit',
    entityId: commit.sha,
    chunks: chunkText(text),
    metadata: {
      repoId,
      sha: commit.sha,
      authorLogin: commit.authorLogin,
      timestamp: commit.timestamp.toISOString(),
      additions: commit.additions,
      deletions: commit.deletions,
    },
  };
}

/**
 * Chunks PR data into embeddable text fragments.
 */
export function chunkPullRequest(pr: PRData, repoId: string): ChunkedEntity {
  const text = [
    `Pull Request #${pr.number}: ${pr.title}`,
    `State: ${pr.state} | Author: ${pr.authorLogin}`,
    pr.labels.length > 0 ? `Labels: ${pr.labels.join(', ')}` : '',
    pr.body ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    entityType: 'pull_request',
    entityId: String(pr.number),
    chunks: chunkText(text),
    metadata: {
      repoId,
      prNumber: pr.number,
      state: pr.state,
      authorLogin: pr.authorLogin,
    },
  };
}

/**
 * Chunks issue data into embeddable text fragments.
 */
export function chunkIssue(issue: IssueData, repoId: string): ChunkedEntity {
  const text = [
    `Issue #${issue.number}: ${issue.title}`,
    `State: ${issue.state} | Author: ${issue.authorLogin}`,
    issue.labels.length > 0 ? `Labels: ${issue.labels.join(', ')}` : '',
    issue.body ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    entityType: 'issue',
    entityId: String(issue.number),
    chunks: chunkText(text),
    metadata: {
      repoId,
      issueNumber: issue.number,
      state: issue.state,
      authorLogin: issue.authorLogin,
    },
  };
}
