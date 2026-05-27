import type { PrismaClient } from '@prisma/client';
import type { ModuleIntelligence } from './types.js';
import { analyzeFile } from './file-analysis.js';

/**
 * Aggregates code health metrics for a directory/module recursively.
 */
export async function analyzeModule(
  db: PrismaClient,
  repoId: string,
  modulePath: string,
): Promise<ModuleIntelligence | null> {
  const normalizedModule = modulePath.replace(/\\/g, '/').replace(/\/$/, '');

  // 1. Fetch all files for this repository to check which are matching the path
  const allFiles = await db.file.findMany({
    where: {
      repoId,
    },
  });

  const matchingFiles = allFiles.filter((f) => {
    const fPath = f.path.replace(/\\/g, '/');
    return fPath === normalizedModule || fPath.startsWith(normalizedModule + '/');
  });

  if (matchingFiles.length === 0) {
    return null;
  }

  // 2. Fetch all commits touching any of these files
  const filePaths = matchingFiles.map((f) => f.path);
  const commits = await db.commit.findMany({
    where: {
      repoId,
      filesChanged: {
        hasSome: filePaths,
      },
    },
    include: {
      author: true,
    },
  });

  // Calculate active contributors and module-level owners
  const contributorMap = new Map<string, number>();
  let totalChurn = 0;

  for (const commit of commits) {
    totalChurn += (commit.additions + commit.deletions);
    const author = commit.author.login;
    contributorMap.set(author, (contributorMap.get(author) || 0) + 1);
  }

  // 3. Compute average file instability score
  let totalInstability = 0;
  for (const file of matchingFiles) {
    const fileIntel = await analyzeFile(db, repoId, file.path);
    if (fileIntel) {
      totalInstability += fileIntel.instabilityScore;
    }
  }

  const averageInstabilityScore = Math.round(totalInstability / matchingFiles.length);

  let moduleHealth: 'Healthy' | 'Needs Review' | 'Critical Volatility' = 'Healthy';
  if (averageInstabilityScore > 75) {
    moduleHealth = 'Critical Volatility';
  } else if (averageInstabilityScore > 45) {
    moduleHealth = 'Needs Review';
  }

  const totalCommitsCount = commits.length;
  const topOwners = Array.from(contributorMap.entries())
    .map(([login, count]) => ({
      login,
      ownershipPercent: totalCommitsCount > 0 ? Math.round((count / totalCommitsCount) * 100) : 0,
    }))
    .sort((a, b) => b.ownershipPercent - a.ownershipPercent)
    .slice(0, 5);

  return {
    modulePath: normalizedModule,
    totalFiles: matchingFiles.length,
    totalCommits: totalCommitsCount,
    totalChurn,
    activeContributorsCount: contributorMap.size,
    averageInstabilityScore,
    moduleHealth,
    topOwners,
  };
}
