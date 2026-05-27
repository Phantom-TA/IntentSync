import { GeminiEmbeddingProvider, ChromaStore } from '@intentsync/embeddings';
import { RetrievalError } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';
import type { SemanticChunk } from './types.js';

export interface SemanticSearchOptions {
  geminiApiKey: string;
  embeddingModel: string;
  chromaHost: string;
  chromaCollectionPrefix: string;
}

const ENTITY_TYPES = ['commit', 'pull_request', 'issue'] as const;

/**
 * Embeds the user query and fans out to all ChromaDB collections in parallel.
 * Filters by repoId and returns a flat, distance-sorted list of SemanticChunks.
 */
export async function semanticSearch(
  query: string,
  repoId: string,
  topK: number,
  options: SemanticSearchOptions,
): Promise<SemanticChunk[]> {
  const log = createLogger('retrieval:semantic-search');
  const start = Date.now();

  // 1. Embed the query
  const embeddingProvider = new GeminiEmbeddingProvider(
    options.geminiApiKey,
    options.embeddingModel,
  );

  let queryEmbedding: number[];
  try {
    const embeddings = await embeddingProvider.embed([query]);
    if (!embeddings[0]) {
      throw new RetrievalError('Empty embedding returned for query', { query });
    }
    queryEmbedding = embeddings[0];
  } catch (error) {
    throw new RetrievalError(
      `Failed to embed query: ${String(error)}`,
      { query },
    );
  }

  // 2. Fan out to all entity collections in parallel
  const chromaStore = new ChromaStore({
    host: options.chromaHost,
    collectionPrefix: options.chromaCollectionPrefix,
  });

  const perTypeK = Math.max(Math.ceil(topK / ENTITY_TYPES.length), 5);

  const results = await Promise.allSettled(
    ENTITY_TYPES.map(async (entityType) => {
      try {
        return await chromaStore.query({
          entityType,
          queryEmbedding,
          topK: perTypeK,
          where: { repoId },
        });
      } catch {
        // Collection may not exist if no entities of that type were synced
        log.warn({ entityType }, 'ChromaDB collection query failed — skipping');
        return { ids: [], documents: [], distances: [], metadatas: [] };
      }
    }),
  );

  // 3. Flatten and normalize results into SemanticChunk[]
  const chunks: SemanticChunk[] = [];

  for (let i = 0; i < ENTITY_TYPES.length; i++) {
    const entityType = ENTITY_TYPES[i]!;
    const result = results[i];
    if (result.status !== 'fulfilled') continue;

    const { ids, documents, distances, metadatas } = result.value;

    for (let j = 0; j < ids.length; j++) {
      const id = ids[j];
      const doc = documents[j];
      const distance = distances[j];
      const meta = metadatas[j];

      if (!id || doc === null || doc === undefined || distance === undefined) continue;

      // Extract entityId from metadata (sha for commits, number for PRs/issues)
      const entityId = String(
        entityType === 'commit'
          ? (meta?.['sha'] ?? id)
          : entityType === 'pull_request'
            ? (meta?.['prNumber'] ?? id)
            : (meta?.['issueNumber'] ?? id),
      );

      chunks.push({
        id,
        entityType,
        entityId,
        chunkText: doc,
        distance,
        metadata: (meta ?? {}) as Record<string, string | number | boolean>,
      });
    }
  }

  // 4. Sort by distance (ascending = most similar first), take top-K
  chunks.sort((a, b) => a.distance - b.distance);
  const topChunks = chunks.slice(0, topK);

  log.info(
    { query: query.slice(0, 60), totalChunks: chunks.length, returned: topChunks.length, durationMs: Date.now() - start },
    'Semantic search complete',
  );

  return topChunks;
}
