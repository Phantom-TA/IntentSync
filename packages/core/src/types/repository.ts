export type RepositorySource = 'github' | 'local';

export interface RepositoryMetadata {
  id: string;
  owner: string;
  name: string;
  url: string;
  source: RepositorySource;
  defaultBranch: string;
  description?: string;
}

export interface CommitFetchOptions {
  branch?: string;
  since?: Date;
  maxCount?: number;
}

export interface CommitData {
  sha: string;
  message: string;
  authorLogin: string;
  authorEmail: string;
  timestamp: Date;
  filesChanged: string[];
  additions: number;
  deletions: number;
  parents: string[];
}

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  patch?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  previousPath?: string;
}

export interface DiffData {
  sha: string;
  files: FileDiff[];
}

export interface FileEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface PRData {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed' | 'merged';
  authorLogin: string;
  commitShas: string[];
  createdAt: Date;
  mergedAt?: Date;
  labels: string[];
}

export interface IssueData {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  authorLogin: string;
  labels: string[];
  createdAt: Date;
  closedAt?: Date;
  referencedPRNumbers: number[];
}

export interface ContributorData {
  login: string;
  email?: string;
  commitCount: number;
}
