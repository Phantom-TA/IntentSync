import type { PrismaClient } from '@prisma/client';
import type { FileIntelligence } from './types.js';

/**
 * Analyzes file revisions, modifications, and recency of revisions to compute stability metrics.
 */
export async function analyzeFile(
  db: PrismaClient,
  repoId: string,
  filePath: string,
): Promise<FileIntelligence | null> {
  // 1. Resolve file in database to ensure it exists
  const file = await db.file.findUnique({
    where: {
      path_repoId: {
        path: filePath,
        repoId,
      },
    },
  });

  if (!file) {
    return null;
  }

  // 2. Fetch all commits touching this file
  const commits = await db.commit.findMany({
    where: {
      repoId,
      filesChanged: {
        has: filePath,
      },
    },
    include: {
      author: true,
    },
    orderBy: {
      timestamp: 'desc',
    },
  });

  if (commits.length === 0) {
    return {
      filePath,
      totalCommits: 0,
      totalChurn: 0,
      additions: 0,
      deletions: 0,
      lastModifiedAt: new Date(),
      daysSinceLastModification: 0,
      instabilityScore: 0,
      rating: 'Stable',
      topContributors: [],
    };
  }

  // 3. Compute additions, deletions, total commits, and recency-decay instability score
  let totalAdditions = 0;
  let totalDeletions = 0;
  let weightedRevisions = 0;
  const now = new Date();

  // Keep track of authors
  const contributorMap = new Map<string, { commitCount: number; churn: number }>();

  for (const commit of commits) {
    totalAdditions += commit.additions;
    totalDeletions += commit.deletions;

    const ageInDays = Math.abs(now.getTime() - commit.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    // Recency Weight: exponential decay weight (today = 1.0, 30 days = 0.54, 90 days = 0.16)
    const weight = Math.exp(-0.02 * ageInDays);
    weightedRevisions += weight;

    const author = commit.author.login;
    const current = contributorMap.get(author) || { commitCount: 0, churn: 0 };
    current.commitCount += 1;
    current.churn += (commit.additions + commit.deletions);
    contributorMap.set(author, current);
  }

  const totalChurn = totalAdditions + totalDeletions;
  // Raw Instability formula: scales with weighted revisions and total churn
  const rawInstability = (weightedRevisions * 8) + (Math.log(totalChurn + 1) * 3);
  const instabilityScore = Math.min(100, Math.max(0, Math.round(rawInstability)));

  let rating: 'Stable' | 'Moderate' | 'Active' | 'Highly Volatile' = 'Stable';
  if (instabilityScore > 80) {
    rating = 'Highly Volatile';
  } else if (instabilityScore > 50) {
    rating = 'Active';
  } else if (instabilityScore > 20) {
    rating = 'Moderate';
  }

  const lastModifiedAt = commits[0].timestamp;
  const daysSinceLastModification = Math.max(
    0,
    Math.floor(Math.abs(now.getTime() - lastModifiedAt.getTime()) / (1000 * 60 * 60 * 24)),
  );

  // Calculate top contributors
  const totalCommitsCount = commits.length;
  const topContributors = Array.from(contributorMap.entries())
    .map(([login, stats]) => ({
      login,
      commitCount: stats.commitCount,
      ownershipPercent: Math.round((stats.commitCount / totalCommitsCount) * 100),
    }))
    .sort((a, b) => b.commitCount - a.commitCount);

  return {
    filePath,
    totalCommits: totalCommitsCount,
    totalChurn,
    additions: totalAdditions,
    deletions: totalDeletions,
    lastModifiedAt,
    daysSinceLastModification,
    instabilityScore,
    rating,
    topContributors,
  };
}
