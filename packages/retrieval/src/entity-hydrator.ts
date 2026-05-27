import type { PrismaClient, Commit, PullRequest, Issue, Developer } from '@prisma/client';
import { createLogger } from '@intentsync/logger';
import type { SemanticChunk, HydratedCommit, HydratedPR, HydratedIssue } from './types.js';

type CommitWithAuthor = Commit & { author: Developer | null };

export interface HydrationResult {
  commits: HydratedCommit[];
  pullRequests: HydratedPR[];
  issues: HydratedIssue[];
}

/**
 * Takes semantic chunks and fetches the full entity records from PostgreSQL.
 * Falls back gracefully if the DB is unavailable.
 */
export async function hydrateEntities(
  chunks: SemanticChunk[],
  repoId: string,
  db: PrismaClient,
): Promise<HydrationResult> {
  const log = createLogger('retrieval:hydrator');

  // Deduplicate entity IDs per type
  const commitShas = [
    ...new Set(
      chunks
        .filter((c) => c.entityType === 'commit')
        .map((c) => c.entityId),
    ),
  ];

  const prNumbers = [
    ...new Set(
      chunks
        .filter((c) => c.entityType === 'pull_request')
        .map((c) => parseInt(c.entityId, 10))
        .filter((n) => !isNaN(n)),
    ),
  ];

  const issueNumbers = [
    ...new Set(
      chunks
        .filter((c) => c.entityType === 'issue')
        .map((c) => parseInt(c.entityId, 10))
        .filter((n) => !isNaN(n)),
    ),
  ];

  // Fetch in parallel, fail individually without aborting others
  const [rawCommits, rawPRs, rawIssues]: [
    CommitWithAuthor[],
    PullRequest[],
    Issue[],
  ] = await Promise.all([
    commitShas.length > 0
      ? db.commit
          .findMany({
            where: { sha: { in: commitShas }, repoId },
            include: { author: true },
            orderBy: { timestamp: 'desc' },
          })
          .catch((e: unknown) => {
            log.warn({ err: String(e) }, 'Failed to hydrate commits from DB');
            return [];
          })
      : Promise.resolve([]),

    prNumbers.length > 0
      ? db.pullRequest
          .findMany({
            where: { number: { in: prNumbers }, repoId },
            orderBy: { createdAt: 'desc' },
          })
          .catch((e: unknown) => {
            log.warn({ err: String(e) }, 'Failed to hydrate PRs from DB');
            return [];
          })
      : Promise.resolve([]),

    issueNumbers.length > 0
      ? db.issue
          .findMany({
            where: { number: { in: issueNumbers }, repoId },
            orderBy: { createdAt: 'desc' },
          })
          .catch((e: unknown) => {
            log.warn({ err: String(e) }, 'Failed to hydrate issues from DB');
            return [];
          })
      : Promise.resolve([]),
  ]);

  // Map to clean hydrated shapes (avoids leaking Prisma internals)
  const commits: HydratedCommit[] = rawCommits.map((c) => ({
    sha: c.sha,
    message: c.message,
    authorLogin: c.author?.login ?? 'unknown',
    timestamp: c.timestamp,
    filesChanged: c.filesChanged,
    additions: c.additions,
    deletions: c.deletions,
    aiSummary: c.aiSummary,
  }));

  const pullRequests: HydratedPR[] = rawPRs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    authorLogin: pr.authorLogin,
    labels: pr.labels,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    aiSummary: pr.aiSummary,
  }));

  const issues: HydratedIssue[] = rawIssues.map((i) => ({
    number: i.number,
    title: i.title,
    body: i.body,
    state: i.state,
    authorLogin: i.authorLogin,
    labels: i.labels,
    createdAt: i.createdAt,
    closedAt: i.closedAt,
  }));

  log.info(
    { commits: commits.length, prs: pullRequests.length, issues: issues.length },
    'Entity hydration complete',
  );

  return { commits, pullRequests, issues };
}
