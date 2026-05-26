import { stableId, type CommitData, type PRData, type IssueData } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';
import type { EmbeddingProvider } from './embedding-provider.js';
import { ChromaStore } from './chroma-store.js';
import { chunkCommit, chunkPullRequest, chunkIssue, type ChunkedEntity } from './chunker.js';

export interface EmbeddingPipelineOptions {
  chromaHost: string;
  chromaCollectionPrefix: string;
}

export interface EmbeddingPipelineResult {
  chunksGenerated: number;
  embeddingsStored: number;
  durationMs: number;
}

/**
 * Runs the embedding pipeline:
 *   1. Chunk all entities into text fragments
 *   2. Generate embeddings via EmbeddingProvider (Gemini)
 *   3. Store embeddings + metadata in ChromaDB
 *
 * Processes in batches to stay within API rate limits.
 */
export async function runEmbeddingPipeline(
  provider: EmbeddingProvider,
  options: EmbeddingPipelineOptions,
  repoId: string,
  data: {
    commits: CommitData[];
    pullRequests: PRData[];
    issues: IssueData[];
  },
): Promise<EmbeddingPipelineResult> {
  const start = Date.now();
  const log = createLogger('embeddings', repoId);
  const store = new ChromaStore({
    host: options.chromaHost,
    collectionPrefix: options.chromaCollectionPrefix,
  });

  // ── 1. Chunk all entities ────────────────────────────────────
  const allChunked: ChunkedEntity[] = [];

  for (const commit of data.commits) {
    allChunked.push(chunkCommit(commit, repoId));
  }
  for (const pr of data.pullRequests) {
    allChunked.push(chunkPullRequest(pr, repoId));
  }
  for (const issue of data.issues) {
    allChunked.push(chunkIssue(issue, repoId));
  }

  // Flatten into individual chunk records
  const flatChunks: {
    id: string;
    entityType: string;
    text: string;
    metadata: Record<string, string | number | boolean>;
  }[] = [];

  for (const entity of allChunked) {
    for (let i = 0; i < entity.chunks.length; i++) {
      flatChunks.push({
        id: stableId(repoId, entity.entityType, entity.entityId, String(i)),
        entityType: entity.entityType,
        text: entity.chunks[i]!,
        metadata: {
          ...entity.metadata,
          chunkIndex: i,
          entityId: entity.entityId,
        },
      });
    }
  }

  log.info(
    { entities: allChunked.length, totalChunks: flatChunks.length },
    'Entities chunked',
  );

  if (flatChunks.length === 0) {
    return { chunksGenerated: 0, embeddingsStored: 0, durationMs: Date.now() - start };
  }

  // ── 2. Generate embeddings in batches ────────────────────────
  const BATCH_SIZE = 50;
  let embeddingsStored = 0;

  for (let i = 0; i < flatChunks.length; i += BATCH_SIZE) {
    const batch = flatChunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.text);

    log.info(
      { batch: `${i + 1}-${Math.min(i + BATCH_SIZE, flatChunks.length)}/${flatChunks.length}` },
      'Generating embeddings',
    );

    const vectors = await provider.embed(texts);

    // ── 3. Group by entityType and store in ChromaDB ───────────
    const byType = new Map<string, typeof batch>();
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]!;
      if (!byType.has(chunk.entityType)) byType.set(chunk.entityType, []);
      byType.get(chunk.entityType)!.push(chunk);
    }

    for (const [entityType, chunks] of byType) {
      const indices = chunks.map((c) => batch.indexOf(c));
      await store.store({
        entityType,
        ids: chunks.map((c) => c.id),
        embeddings: indices.map((idx) => vectors[idx]!),
        documents: chunks.map((c) => c.text),
        metadatas: chunks.map((c) => c.metadata),
      });
      embeddingsStored += chunks.length;
    }
  }

  const durationMs = Date.now() - start;
  log.info(
    { chunksGenerated: flatChunks.length, embeddingsStored, durationMs },
    'Embedding pipeline complete',
  );

  return {
    chunksGenerated: flatChunks.length,
    embeddingsStored,
    durationMs,
  };
}
