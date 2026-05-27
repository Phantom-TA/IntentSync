import type { PrismaClient } from '@prisma/client';
import { createLogger } from '@intentsync/logger';

const log = createLogger('ai-engine:summary-cache');

/**
 * Retrieves a cached AI summary for a commit or PR from PostgreSQL.
 * Returns null if not yet generated or if DB is unavailable.
 */
export async function getCachedSummary(
  db: PrismaClient,
  entityType: 'commit' | 'pull_request',
  entityId: string,
  repoId: string,
): Promise<string | null> {
  try {
    if (entityType === 'commit') {
      const commit = await db.commit.findFirst({
        where: { sha: entityId, repoId },
        select: { aiSummary: true },
      });
      return commit?.aiSummary ?? null;
    }

    if (entityType === 'pull_request') {
      const prNumber = parseInt(entityId, 10);
      if (isNaN(prNumber)) return null;

      const pr = await db.pullRequest.findFirst({
        where: { number: prNumber, repoId },
        select: { aiSummary: true },
      });
      return pr?.aiSummary ?? null;
    }

    return null;
  } catch (error) {
    log.warn({ err: String(error), entityType, entityId }, 'Failed to read summary cache');
    return null;
  }
}

/**
 * Persists a generated AI summary back to the entity record in PostgreSQL.
 * Fails silently — caching is a best-effort optimisation, not a hard requirement.
 */
export async function storeSummary(
  db: PrismaClient,
  entityType: 'commit' | 'pull_request',
  entityId: string,
  repoId: string,
  summary: string,
): Promise<void> {
  try {
    if (entityType === 'commit') {
      await db.commit.updateMany({
        where: { sha: entityId, repoId },
        data: { aiSummary: summary },
      });
      log.debug({ sha: entityId }, 'Commit AI summary cached');
      return;
    }

    if (entityType === 'pull_request') {
      const prNumber = parseInt(entityId, 10);
      if (isNaN(prNumber)) return;

      await db.pullRequest.updateMany({
        where: { number: prNumber, repoId },
        data: { aiSummary: summary },
      });
      log.debug({ prNumber }, 'PR AI summary cached');
    }
  } catch (error) {
    log.warn({ err: String(error), entityType, entityId }, 'Failed to write summary cache');
  }
}
