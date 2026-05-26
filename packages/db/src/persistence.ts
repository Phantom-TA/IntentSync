import type { PrismaClient } from '@prisma/client';
import type {
  RepositoryMetadata,
  CommitData,
  DiffData,
  PRData,
  IssueData,
  FileEntry,
  ContributorData,
} from '@intentsync/core';
import { createLogger } from '@intentsync/logger';

export interface PersistIngestionInput {
  metadata: RepositoryMetadata;
  commits: CommitData[];
  diffs: Map<string, DiffData>;
  fileTree: FileEntry[];
  pullRequests: PRData[];
  issues: IssueData[];
  contributors: ContributorData[];
}

export interface PersistResult {
  repoId: string;
  commitsPersisted: number;
  prsPersisted: number;
  issuesPersisted: number;
  filesPersisted: number;
  developersPersisted: number;
  durationMs: number;
}

/**
 * Persists all raw ingestion data to PostgreSQL via Prisma.
 * Uses upserts to support incremental re-syncs without duplicates.
 */
export async function persistIngestionResult(
  db: PrismaClient,
  input: PersistIngestionInput,
): Promise<PersistResult> {
  const start = Date.now();
  const log = createLogger('db:persist', input.metadata.id);

  // ── 1. Upsert Repository ──────────────────────────────────────
  const repo = await db.repository.upsert({
    where: {
      owner_name: {
        owner: input.metadata.owner,
        name: input.metadata.name,
      },
    },
    create: {
      owner: input.metadata.owner,
      name: input.metadata.name,
      url: input.metadata.url,
      source: input.metadata.source,
      defaultBranch: input.metadata.defaultBranch,
      description: input.metadata.description,
      lastSyncedAt: new Date(),
    },
    update: {
      url: input.metadata.url,
      defaultBranch: input.metadata.defaultBranch,
      description: input.metadata.description,
      lastSyncedAt: new Date(),
    },
  });
  log.info({ repoId: repo.id }, 'Repository upserted');

  // ── 2. Upsert Developers ─────────────────────────────────────
  const developerLogins = new Set<string>();
  for (const c of input.commits) developerLogins.add(c.authorLogin);
  for (const c of input.contributors) developerLogins.add(c.login);

  const developerMap = new Map<string, string>(); // login → dbId

  for (const login of developerLogins) {
    const contributor = input.contributors.find((c) => c.login === login);
    const dev = await db.developer.upsert({
      where: {
        login_repoId: { login, repoId: repo.id },
      },
      create: {
        login,
        email: input.commits.find((c) => c.authorLogin === login)?.authorEmail,
        repoId: repo.id,
      },
      update: {
        email: input.commits.find((c) => c.authorLogin === login)?.authorEmail,
      },
    });
    developerMap.set(login, dev.id);
  }
  log.info({ count: developerMap.size }, 'Developers upserted');

  // ── 3. Upsert Commits ────────────────────────────────────────
  let commitsPersisted = 0;
  for (const commit of input.commits) {
    const authorId = developerMap.get(commit.authorLogin);
    if (!authorId) continue;

    const diff = input.diffs.get(commit.sha);
    const filesChanged = diff
      ? diff.files.map((f) => f.path)
      : commit.filesChanged;
    const additions = diff
      ? diff.files.reduce((s, f) => s + f.additions, 0)
      : commit.additions;
    const deletions = diff
      ? diff.files.reduce((s, f) => s + f.deletions, 0)
      : commit.deletions;

    await db.commit.upsert({
      where: {
        sha_repoId: { sha: commit.sha, repoId: repo.id },
      },
      create: {
        sha: commit.sha,
        message: commit.message,
        timestamp: commit.timestamp,
        additions,
        deletions,
        filesChanged,
        parents: commit.parents,
        authorId,
        repoId: repo.id,
      },
      update: {
        message: commit.message,
        additions,
        deletions,
        filesChanged,
        parents: commit.parents,
      },
    });
    commitsPersisted++;
  }
  log.info({ count: commitsPersisted }, 'Commits upserted');

  // ── 4. Upsert Pull Requests ──────────────────────────────────
  let prsPersisted = 0;
  for (const pr of input.pullRequests) {
    await db.pullRequest.upsert({
      where: {
        number_repoId: { number: pr.number, repoId: repo.id },
      },
      create: {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        authorLogin: pr.authorLogin,
        commitShas: pr.commitShas,
        labels: pr.labels,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        repoId: repo.id,
      },
      update: {
        title: pr.title,
        body: pr.body,
        state: pr.state,
        commitShas: pr.commitShas,
        labels: pr.labels,
        mergedAt: pr.mergedAt,
      },
    });
    prsPersisted++;
  }
  log.info({ count: prsPersisted }, 'Pull requests upserted');

  // ── 5. Upsert Issues ─────────────────────────────────────────
  let issuesPersisted = 0;
  for (const issue of input.issues) {
    await db.issue.upsert({
      where: {
        number_repoId: { number: issue.number, repoId: repo.id },
      },
      create: {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        authorLogin: issue.authorLogin,
        labels: issue.labels,
        referencedPRNumbers: issue.referencedPRNumbers,
        createdAt: issue.createdAt,
        closedAt: issue.closedAt,
        repoId: repo.id,
      },
      update: {
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels,
        referencedPRNumbers: issue.referencedPRNumbers,
        closedAt: issue.closedAt,
      },
    });
    issuesPersisted++;
  }
  log.info({ count: issuesPersisted }, 'Issues upserted');

  // ── 6. Upsert Files ──────────────────────────────────────────
  // Calculate change frequency from diffs
  const fileChangeCount = new Map<string, number>();
  const fileLastSha = new Map<string, string>();
  for (const [sha, diff] of input.diffs) {
    for (const f of diff.files) {
      fileChangeCount.set(f.path, (fileChangeCount.get(f.path) ?? 0) + 1);
      fileLastSha.set(f.path, sha);
    }
  }

  let filesPersisted = 0;
  for (const entry of input.fileTree) {
    if (entry.type !== 'file') continue;

    await db.file.upsert({
      where: {
        path_repoId: { path: entry.path, repoId: repo.id },
      },
      create: {
        path: entry.path,
        changeFrequency: fileChangeCount.get(entry.path) ?? 0,
        lastModifiedSha: fileLastSha.get(entry.path),
        repoId: repo.id,
      },
      update: {
        changeFrequency: fileChangeCount.get(entry.path) ?? 0,
        lastModifiedSha: fileLastSha.get(entry.path),
      },
    });
    filesPersisted++;
  }
  log.info({ count: filesPersisted }, 'Files upserted');

  const durationMs = Date.now() - start;
  log.info({ durationMs }, 'Persistence complete');

  return {
    repoId: repo.id,
    commitsPersisted,
    prsPersisted,
    issuesPersisted,
    filesPersisted,
    developersPersisted: developerMap.size,
    durationMs,
  };
}
