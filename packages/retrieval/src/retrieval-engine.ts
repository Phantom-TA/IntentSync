import type { PrismaClient } from '@prisma/client';
import { RetrievalError } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';
import { semanticSearch, type SemanticSearchOptions } from './semantic-search.js';
import { hydrateEntities } from './entity-hydrator.js';
import { rankContext } from './context-ranker.js';
import type { RankedContext } from './types.js';

export interface RetrievalEngineOptions {
  geminiApiKey: string;
  embeddingModel: string;
  chromaHost: string;
  chromaCollectionPrefix: string;
}

/**
 * Orchestrates the full retrieval pipeline:
 *   query → embed → semantic search → hydrate entities → rank context
 *
 * This is the primary interface consumed by the AI engine and CLI.
 */
export class RetrievalEngine {
  private searchOptions: SemanticSearchOptions;
  private log = createLogger('retrieval:engine');

  constructor(options: RetrievalEngineOptions) {
    this.searchOptions = {
      geminiApiKey: options.geminiApiKey,
      embeddingModel: options.embeddingModel,
      chromaHost: options.chromaHost,
      chromaCollectionPrefix: options.chromaCollectionPrefix,
    };
  }

  /**
   * Retrieve ranked context for a natural language query against a specific repo.
   *
   * @param query  The user's question
   * @param repoId The PostgreSQL Repository.id (not owner/repo string)
   * @param topK   Number of top context chunks to include (default: 10)
   * @param db     Optional PrismaClient for entity hydration (skipped if null)
   */
  async retrieve(
    query: string,
    repoId: string,
    topK = 10,
    db: PrismaClient | null = null,
  ): Promise<RankedContext> {
    const start = Date.now();
    this.log.info({ query: query.slice(0, 80), repoId, topK }, 'Starting retrieval');

    try {
      // Step 1: Semantic search in ChromaDB
      const chunks = await semanticSearch(query, repoId, topK, this.searchOptions);

      if (chunks.length === 0) {
        this.log.warn({ repoId }, 'No semantic chunks found — repository may not be indexed');
        return {
          query,
          repoId,
          chunks: [],
          commits: [],
          pullRequests: [],
          issues: [],
          confidence: {
            avgSimilarity: 0,
            highRelevanceChunks: 0,
            evidenceCount: 0,
            tier: 'INSUFFICIENT',
          },
          durationMs: Date.now() - start,
        };
      }

      // Step 2: Hydrate full entities from PostgreSQL (if DB available)
      const hydration = db
        ? await hydrateEntities(chunks, repoId, db)
        : { commits: [], pullRequests: [], issues: [] };

      // Step 3: Apply repository-aware ranking
      const context = rankContext(query, repoId, chunks, hydration, Date.now() - start);

      // Step 4: Augment with logical co-change relationships from Neo4j (Phase 6)
      let coChanges: any[] = [];
      try {
        const { verifyNeo4jConnection, getCoChangedFiles } = await import('@intentsync/graph');
        const neo4jHealthy = await verifyNeo4jConnection();
        if (neo4jHealthy) {
          const touchedFiles = new Set<string>();
          for (const commit of context.commits) {
            for (const file of commit.filesChanged) {
              touchedFiles.add(file);
            }
          }
          for (const chunk of context.chunks) {
            if (chunk.entityType === 'file') {
              touchedFiles.add(chunk.entityId);
            }
          }

          if (touchedFiles.size > 0) {
            coChanges = await getCoChangedFiles(repoId, Array.from(touchedFiles), 1);
          }
        }
      } catch (err) {
        this.log.debug(`Neo4j retrieval skipped: ${String(err)}`);
      }

      context.coChanges = coChanges;
      context.durationMs = Date.now() - start;

      this.log.info(
        {
          chunks: context.chunks.length,
          commits: context.commits.length,
          prs: context.pullRequests.length,
          issues: context.issues.length,
          coChanges: context.coChanges.length,
          confidence: context.confidence.tier,
          avgSimilarity: context.confidence.avgSimilarity,
          durationMs: context.durationMs,
        },
        'Retrieval complete',
      );

      return context;
    } catch (error) {
      if (error instanceof RetrievalError) throw error;
      throw new RetrievalError(
        `Retrieval pipeline failed: ${String(error)}`,
        { query, repoId },
      );
    }
  }
}
