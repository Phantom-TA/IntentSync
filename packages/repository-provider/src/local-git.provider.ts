import { simpleGit, type SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import type { Logger } from '@intentsync/logger';
import {
  ProviderError,
  type CommitData,
  type CommitFetchOptions,
  type DiffData,
  type FileEntry,
  type RepositoryMetadata,
} from '@intentsync/core';
import type { RepositoryProvider } from './provider.interface.js';

export interface LocalGitProviderOptions {
  repoPath: string;
  logger: Logger;
}

export class LocalGitProvider implements RepositoryProvider {
  private git: SimpleGit;
  private repoPath: string;
  private log: Logger;

  constructor(options: LocalGitProviderOptions) {
    this.repoPath = path.resolve(options.repoPath);
    this.log = options.logger.child({
      provider: 'local-git',
      repoPath: this.repoPath,
    });

    if (!fs.existsSync(this.repoPath)) {
      throw new ProviderError(`Repository path does not exist: ${this.repoPath}`);
    }

    this.git = simpleGit(this.repoPath);
  }

  async getMetadata(): Promise<RepositoryMetadata> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find((r) => r.name === 'origin');
      const url = origin?.refs.fetch ?? this.repoPath;
      const repoName = path.basename(this.repoPath);

      // Attempt to parse owner/name from remote URL
      const match = url.match(/[:/]([^/]+)\/([^/.]+)(\.git)?$/);
      const owner = match?.[1] ?? 'local';
      const name = match?.[2] ?? repoName;

      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);

      return {
        id: `local:${this.repoPath}`,
        owner,
        name,
        url,
        source: 'local',
        defaultBranch: branch.trim(),
      };
    } catch (error) {
      throw new ProviderError(`Failed to read local repo metadata: ${String(error)}`, {
        repoPath: this.repoPath,
      });
    }
  }

  async getCommits(options: CommitFetchOptions = {}): Promise<CommitData[]> {
    try {
      const { since, maxCount = 500 } = options;

      const logArgs: string[] = ['--format=%H|%ae|%an|%aI|%P|%s', `-n${maxCount}`];
      if (since) logArgs.push(`--since=${since.toISOString()}`);

      const raw = await this.git.raw(['log', ...logArgs]);
      const lines = raw.trim().split('\n').filter(Boolean);

      const commits: CommitData[] = lines.map((line) => {
        const [sha, authorEmail, authorLogin, timestamp, parentsRaw, ...msgParts] =
          line.split('|');
        return {
          sha: sha ?? '',
          message: msgParts.join('|'),
          authorLogin: authorLogin ?? 'unknown',
          authorEmail: authorEmail ?? '',
          timestamp: new Date(timestamp ?? Date.now()),
          filesChanged: [],
          additions: 0,
          deletions: 0,
          parents: parentsRaw ? parentsRaw.trim().split(' ').filter(Boolean) : [],
        };
      });

      this.log.info({ count: commits.length }, 'Local commits read');
      return commits;
    } catch (error) {
      throw new ProviderError(`Failed to read commits: ${String(error)}`, {
        repoPath: this.repoPath,
      });
    }
  }

  async getDiff(sha: string): Promise<DiffData> {
    try {
      const raw = await this.git.raw([
        'diff-tree',
        '--no-commit-id',
        '-r',
        '--numstat',
        sha,
      ]);

      const files = raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [additions, deletions, filePath] = line.split('\t');
          return {
            path: filePath ?? '',
            additions: parseInt(additions ?? '0', 10),
            deletions: parseInt(deletions ?? '0', 10),
            status: 'modified' as const,
          };
        });

      return { sha, files };
    } catch (error) {
      throw new ProviderError(`Failed to get diff for ${sha}: ${String(error)}`);
    }
  }

  async getFileTree(ref = 'HEAD'): Promise<FileEntry[]> {
    try {
      const raw = await this.git.raw(['ls-tree', '-r', '--name-only', ref]);
      return raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((filePath) => ({ path: filePath, type: 'file' as const }));
    } catch (error) {
      throw new ProviderError(`Failed to get file tree: ${String(error)}`);
    }
  }

  // No getPullRequests / getIssues / getContributors for local repos
}
