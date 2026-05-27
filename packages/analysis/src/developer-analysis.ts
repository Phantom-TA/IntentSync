import type { PrismaClient } from '@prisma/client';
import type { DeveloperIntelligence } from './types.js';

/**
 * Computes developer contribution percentages, overall codebase ownership,
 * and lists their primary file hotspots.
 */
export async function analyzeDeveloper(
  db: PrismaClient,
  repoId: string,
  login: string,
): Promise<DeveloperIntelligence | null> {
  // 1. Resolve developer to ensure they contribute to this repo
  const developer = await db.developer.findUnique({
    where: {
      login_repoId: {
        login,
        repoId,
      },
    },
  });

  if (!developer) {
    return null;
  }

  // 2. Fetch all commits in this repository to compute global aggregates
  const allCommits = await db.commit.findMany({
    where: {
      repoId,
    },
    include: {
      author: true,
    },
  });

  if (allCommits.length === 0) {
    return null;
  }

  const totalRepoCommits = allCommits.length;
  let totalRepoChurn = 0;

  let devCommits = 0;
  let devChurn = 0;

  // Track commits per file to compute developer's ownership ratio per file
  const devFileCommitsMap = new Map<string, number>();
  const totalFileCommitsMap = new Map<string, number>();

  for (const commit of allCommits) {
    const commitChurn = commit.additions + commit.deletions;
    totalRepoChurn += commitChurn;

    const isDev = commit.author.login === login;
    if (isDev) {
      devCommits += 1;
      devChurn += commitChurn;
    }

    for (const file of commit.filesChanged) {
      totalFileCommitsMap.set(file, (totalFileCommitsMap.get(file) || 0) + 1);
      if (isDev) {
        devFileCommitsMap.set(file, (devFileCommitsMap.get(file) || 0) + 1);
      }
    }
  }

  const commitSharePercent = (devCommits / totalRepoCommits) * 100;
  const churnSharePercent = totalRepoChurn > 0 ? (devChurn / totalRepoChurn) * 100 : 0;
  const overallOwnershipPercent = (commitSharePercent * 0.4) + (churnSharePercent * 0.6);

  // Compute top 10 files owned by this developer (highest percentage of modifying commits)
  const topOwnedFiles = Array.from(devFileCommitsMap.entries())
    .map(([filePath, count]) => {
      const totalCount = totalFileCommitsMap.get(filePath) || 1;
      return {
        filePath,
        authorSharePercent: Math.round((count / totalCount) * 100),
      };
    })
    .sort((a, b) => b.authorSharePercent - a.authorSharePercent || a.filePath.localeCompare(b.filePath))
    .slice(0, 10);

  return {
    login,
    totalCommits: devCommits,
    commitSharePercent: Math.round(commitSharePercent * 10) / 10,
    totalChurn: devChurn,
    churnSharePercent: Math.round(churnSharePercent * 10) / 10,
    overallOwnershipPercent: Math.round(overallOwnershipPercent * 10) / 10,
    topOwnedFiles,
  };
}
