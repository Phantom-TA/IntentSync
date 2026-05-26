import { Octokit } from '@octokit/rest';
import { simpleGit } from 'simple-git';
import os from 'os';
import path from 'path';
import fs from 'fs';
import type { Logger } from '@intentsync/logger';
import {
  ProviderError,
  type CommitData,
  type CommitFetchOptions,
  type ContributorData,
  type DiffData,
  type FileEntry,
  type IssueData,
  type PRData,
  type RepositoryMetadata,
} from '@intentsync/core';
import type { RepositoryProvider } from './provider.interface.js';

export interface GitHubProviderOptions {
  owner: string;
  repo: string;
  token: string;
  logger: Logger;
  /** Local clone path — defaults to OS temp dir */
  clonePath?: string;
}

export class GitHubProvider implements RepositoryProvider {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private log: Logger;
  private clonePath: string;

  constructor(private readonly options: GitHubProviderOptions) {
    this.octokit = new Octokit({ auth: options.token });
    this.owner = options.owner;
    this.repo = options.repo;
    this.log = options.logger.child({
      provider: 'github',
      owner: options.owner,
      repo: options.repo,
    });
    this.clonePath =
      options.clonePath ??
      path.join(os.tmpdir(), 'intentsync', options.owner, options.repo);
  }

  async getMetadata(): Promise<RepositoryMetadata> {
    try {
      const { data } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return {
        id: `github:${this.owner}/${this.repo}`,
        owner: this.owner,
        name: this.repo,
        url: data.clone_url,
        source: 'github',
        defaultBranch: data.default_branch,
        description: data.description ?? undefined,
      };
    } catch (error) {
      throw new ProviderError(`Failed to fetch repo metadata: ${String(error)}`, {
        owner: this.owner,
        repo: this.repo,
      });
    }
  }

  async getCommits(options: CommitFetchOptions = {}): Promise<CommitData[]> {
    try {
      this.log.debug({ options }, 'Fetching commits via Octokit');
      const { branch, since, maxCount = 500 } = options;

      const perPage = Math.min(maxCount, 100);
      const pages = Math.ceil(maxCount / perPage);
      const commits: CommitData[] = [];

      for (let page = 1; page <= pages && commits.length < maxCount; page++) {
        const { data } = await this.octokit.repos.listCommits({
          owner: this.owner,
          repo: this.repo,
          sha: branch,
          since: since?.toISOString(),
          per_page: perPage,
          page,
        });

        for (const c of data) {
          commits.push({
            sha: c.sha,
            message: c.commit.message,
            authorLogin: c.author?.login ?? c.commit.author?.name ?? 'unknown',
            authorEmail: c.commit.author?.email ?? '',
            timestamp: new Date(c.commit.author?.date ?? Date.now()),
            filesChanged: [],  // populated via getDiff when needed
            additions: 0,
            deletions: 0,
            parents: c.parents.map((p) => p.sha),
          });
        }

        if (data.length < perPage) break;
      }

      this.log.info({ count: commits.length }, 'Commits fetched');
      return commits;
    } catch (error) {
      throw new ProviderError(`Failed to fetch commits: ${String(error)}`, {
        owner: this.owner,
        repo: this.repo,
      });
    }
  }

  async getDiff(sha: string): Promise<DiffData> {
    try {
      const { data } = await this.octokit.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: sha,
      });

      return {
        sha,
        files: (data.files ?? []).map((f) => ({
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch,
          status: f.status as 'added' | 'modified' | 'deleted' | 'renamed',
          previousPath: f.previous_filename,
        })),
      };
    } catch (error) {
      throw new ProviderError(`Failed to fetch diff for ${sha}: ${String(error)}`);
    }
  }

  async getFileTree(ref?: string): Promise<FileEntry[]> {
    try {
      const { data } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: ref ?? 'HEAD',
        recursive: '1',
      });

      return (data.tree ?? [])
        .filter((item) => item.path !== undefined)
        .map((item) => ({
          path: item.path!,
          type: item.type === 'tree' ? 'dir' : 'file',
          size: item.size,
        }));
    } catch (error) {
      throw new ProviderError(`Failed to fetch file tree: ${String(error)}`);
    }
  }

  async getPullRequests(): Promise<PRData[]> {
    try {
      const prs: PRData[] = [];
      let page = 1;

      while (true) {
        const { data } = await this.octokit.pulls.list({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100,
          page,
        });

        if (data.length === 0) break;

        for (const pr of data) {
          prs.push({
            number: pr.number,
            title: pr.title,
            body: pr.body ?? undefined,
            state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
            authorLogin: pr.user?.login ?? 'unknown',
            commitShas: [],  // fetched separately if needed
            createdAt: new Date(pr.created_at),
            mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
            labels: pr.labels.map((l) => l.name),
          });
        }

        if (data.length < 100) break;
        page++;
      }

      this.log.info({ count: prs.length }, 'Pull requests fetched');
      return prs;
    } catch (error) {
      throw new ProviderError(`Failed to fetch PRs: ${String(error)}`);
    }
  }

  async getIssues(): Promise<IssueData[]> {
    try {
      const issues: IssueData[] = [];
      let page = 1;

      while (true) {
        const { data } = await this.octokit.issues.listForRepo({
          owner: this.owner,
          repo: this.repo,
          state: 'all',
          per_page: 100,
          page,
        });

        // Filter out pull requests (GitHub returns them in issues endpoint)
        const realIssues = data.filter((i) => !i.pull_request);
        if (data.length === 0) break;

        for (const issue of realIssues) {
          const prRefs = (issue.body ?? '')
            .match(/#(\d+)/g)
            ?.map((m) => parseInt(m.slice(1), 10)) ?? [];

          issues.push({
            number: issue.number,
            title: issue.title,
            body: issue.body ?? undefined,
            state: issue.state as 'open' | 'closed',
            authorLogin: issue.user?.login ?? 'unknown',
            labels: issue.labels.map((l) =>
              typeof l === 'string' ? l : l.name ?? '',
            ),
            createdAt: new Date(issue.created_at),
            closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
            referencedPRNumbers: prRefs,
          });
        }

        if (data.length < 100) break;
        page++;
      }

      this.log.info({ count: issues.length }, 'Issues fetched');
      return issues;
    } catch (error) {
      throw new ProviderError(`Failed to fetch issues: ${String(error)}`);
    }
  }

  async getContributors(): Promise<ContributorData[]> {
    try {
      const { data } = await this.octokit.repos.listContributors({
        owner: this.owner,
        repo: this.repo,
        per_page: 100,
      });

      return data.map((c) => ({
        login: c.login ?? 'unknown',
        commitCount: c.contributions,
      }));
    } catch (error) {
      throw new ProviderError(`Failed to fetch contributors: ${String(error)}`);
    }
  }

  /** Ensures the repo is cloned locally for diff operations */
  private async ensureCloned(): Promise<void> {
    if (!fs.existsSync(this.clonePath)) {
      this.log.info({ clonePath: this.clonePath }, 'Cloning repository');
      fs.mkdirSync(this.clonePath, { recursive: true });
      const url = `https://x-access-token:${this.options.token}@github.com/${this.owner}/${this.repo}.git`;
      await simpleGit().clone(url, this.clonePath, ['--depth', '1000']);
    }
  }
}
