import type {
  CommitData,
  CommitFetchOptions,
  ContributorData,
  DiffData,
  FileEntry,
  IssueData,
  PRData,
  RepositoryMetadata,
} from '@intentsync/core';

/**
 * Normalised interface for all repository data sources.
 * Implementations: GitHubProvider, LocalGitProvider.
 */
export interface RepositoryProvider {
  /** Normalised repository metadata */
  getMetadata(): Promise<RepositoryMetadata>;

  /** Commits, newest first, with optional filtering */
  getCommits(options?: CommitFetchOptions): Promise<CommitData[]>;

  /** Full diff for a single commit SHA */
  getDiff(sha: string): Promise<DiffData>;

  /** File tree at the given ref (defaults to HEAD) */
  getFileTree(ref?: string): Promise<FileEntry[]>;

  /** Pull requests — GitHub only; undefined for local repos */
  getPullRequests?(): Promise<PRData[]>;

  /** Issues — GitHub only; undefined for local repos */
  getIssues?(): Promise<IssueData[]>;

  /** Contributors sorted by commit count */
  getContributors?(): Promise<ContributorData[]>;
}
