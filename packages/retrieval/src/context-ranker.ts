import { isWithinDays } from '@intentsync/core';
import type { SemanticChunk, HydratedCommit, HydratedPR, RankedContext, RetrievalConfidence } from './types.js';
import type { HydrationResult } from './entity-hydrator.js';

/**
 * Computes an objective RetrievalConfidence from ChromaDB chunk distance scores.
 */
function computeConfidence(
  chunks: SemanticChunk[],
  evidenceCount: number,
): RetrievalConfidence {
  if (chunks.length === 0) {
    return { avgSimilarity: 0, highRelevanceChunks: 0, evidenceCount: 0, tier: 'INSUFFICIENT' };
  }

  const similarities = chunks.map((c) => 1 - c.distance / 2);
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const highRelevanceChunks = chunks.filter((c) => c.distance < 0.4).length;

  let tier: RetrievalConfidence['tier'];
  if (avgSimilarity >= 0.75 && evidenceCount >= 2) {
    tier = 'HIGH';
  } else if (avgSimilarity >= 0.55 && evidenceCount >= 1) {
    tier = 'MEDIUM';
  } else if (avgSimilarity >= 0.35) {
    tier = 'LOW';
  } else {
    tier = 'INSUFFICIENT';
  }

  return {
    avgSimilarity: Math.round(avgSimilarity * 100) / 100,
    highRelevanceChunks,
    evidenceCount,
    tier,
  };
}

/**
 * Applies repository-aware ranking on top of semantic distance.
 *
 * Scoring logic (lower distance = better, boosts reduce the effective distance):
 *  - Recency boost: commits/PRs from the last 30 days score higher
 *  - Merge status boost: merged PRs score higher than open/closed
 *  - Chunk text quality: longer, more informative chunks are preferred
 */
export function rankContext(
  query: string,
  repoId: string,
  chunks: SemanticChunk[],
  hydration: HydrationResult,
  durationMs: number,
): RankedContext {
  // Build quick-lookup maps for hydrated entities
  const commitMap = new Map<string, HydratedCommit>(
    hydration.commits.map((c) => [c.sha, c]),
  );
  const prMap = new Map<number, HydratedPR>(
    hydration.pullRequests.map((pr) => [pr.number, pr]),
  );

  // Score each chunk — lower = better rank
  const scored = chunks.map((chunk) => {
    let score = chunk.distance; // Base: ChromaDB cosine distance

    if (chunk.entityType === 'commit') {
      const commit = commitMap.get(chunk.entityId);
      if (commit) {
        // Recency boost: recent commits score better
        if (isWithinDays(commit.timestamp, 30)) score -= 0.08;
        else if (isWithinDays(commit.timestamp, 90)) score -= 0.04;

        // Size signal: substantial commits are more relevant
        const changeSize = commit.additions + commit.deletions;
        if (changeSize > 50) score -= 0.02;
      }
    }

    if (chunk.entityType === 'pull_request') {
      const prNumber = parseInt(chunk.entityId, 10);
      const pr = !isNaN(prNumber) ? prMap.get(prNumber) : undefined;
      if (pr) {
        // Merged PRs are the most authoritative
        if (pr.state === 'merged' || pr.mergedAt !== null) score -= 0.10;
        else if (pr.state === 'closed') score -= 0.02;

        // Recency boost for PRs
        if (isWithinDays(pr.createdAt, 60)) score -= 0.05;
      }
    }

    // Chunk text length heuristic: more context = more useful (small bonus)
    if (chunk.chunkText.length > 200) score -= 0.01;

    return { chunk, score };
  });

  // Re-sort by adjusted score (ascending)
  scored.sort((a, b) => a.score - b.score);

  const rankedChunks = scored.map((s) => s.chunk);

  // Collect the hydrated entities referenced by the ranked chunks, in rank order
  const seenCommits = new Set<string>();
  const seenPRs = new Set<number>();
  const seenIssues = new Set<number>();

  const commits: HydratedCommit[] = [];
  const pullRequests: HydratedPR[] = [];
  const issues = [...hydration.issues]; // Issues have simpler ranking

  for (const chunk of rankedChunks) {
    if (chunk.entityType === 'commit') {
      const commit = commitMap.get(chunk.entityId);
      if (commit && !seenCommits.has(commit.sha)) {
        seenCommits.add(commit.sha);
        commits.push(commit);
      }
    }
    if (chunk.entityType === 'pull_request') {
      const prNumber = parseInt(chunk.entityId, 10);
      const pr = !isNaN(prNumber) ? prMap.get(prNumber) : undefined;
      if (pr && !seenPRs.has(pr.number)) {
        seenPRs.add(pr.number);
        pullRequests.push(pr);
      }
    }
    if (chunk.entityType === 'issue') {
      const issueNumber = parseInt(chunk.entityId, 10);
      seenIssues.add(issueNumber);
    }
  }

  const filteredIssues = issues.filter((i) => seenIssues.has(i.number));
  const evidenceCount = commits.length + pullRequests.length + filteredIssues.length;
  const confidence = computeConfidence(rankedChunks, evidenceCount);

  return {
    query,
    repoId,
    chunks: rankedChunks,
    commits,
    pullRequests,
    issues: filteredIssues,
    confidence,
    durationMs,
  };
}
