import type {
  RepositoryMetadata,
  CommitData,
  DiffData,
  FileEntry,
  PRData,
  IssueData,
  ContributorData,
} from '@intentsync/core';

/**
 * Complete result of an ingestion run.
 * Contains all raw metadata extracted from the repository — no AI processing.
 */
export interface IngestionResult {
  metadata: RepositoryMetadata;
  commits: CommitData[];
  diffs: Map<string, DiffData>;
  fileTree: FileEntry[];
  pullRequests: PRData[];
  issues: IssueData[];
  contributors: ContributorData[];
  stats: IngestionStats;
}

export interface IngestionStats {
  commitCount: number;
  diffCount: number;
  fileCount: number;
  prCount: number;
  issueCount: number;
  contributorCount: number;
  durationMs: number;
}

export interface IngestionOptions {
  /** Maximum commits to fetch */
  maxCommits?: number;
  /** Only fetch commits after this date */
  since?: Date;
  /** Fetch diffs for each commit (can be slow for large repos) */
  fetchDiffs?: boolean;
  /** Max number of commits to fetch diffs for */
  maxDiffCommits?: number;
}
