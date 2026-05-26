import { ChromaClient, type Collection } from 'chromadb';
import { createLogger } from '@intentsync/logger';
import { EmbeddingError } from '@intentsync/core';

let _client: ChromaClient | null = null;

function getChromaClient(host: string): ChromaClient {
  if (!_client) {
    _client = new ChromaClient({ path: host });
  }
  return _client;
}

export interface ChromaStoreOptions {
  host: string;
  collectionPrefix: string;
}

/**
 * Wrapper around ChromaDB for storing and querying embeddings.
 */
export class ChromaStore {
  private client: ChromaClient;
  private prefix: string;
  private log = createLogger('embeddings:chroma');

  constructor(options: ChromaStoreOptions) {
    this.client = getChromaClient(options.host);
    this.prefix = options.collectionPrefix;
  }

  /**
   * Get or create a collection for the given entity type.
   */
  private async getCollection(entityType: string): Promise<Collection> {
    const name = `${this.prefix}_${entityType}`;
    return this.client.getOrCreateCollection({ name });
  }

  /**
   * Store embeddings in ChromaDB.
   * Returns the ChromaDB IDs for each stored embedding.
   */
  async store(params: {
    entityType: string;
    ids: string[];
    embeddings: number[][];
    documents: string[];
    metadatas: Record<string, string | number | boolean>[];
  }): Promise<void> {
    try {
      const collection = await this.getCollection(params.entityType);

      await collection.upsert({
        ids: params.ids,
        embeddings: params.embeddings,
        documents: params.documents,
        metadatas: params.metadatas,
      });

      this.log.debug(
        { collection: `${this.prefix}_${params.entityType}`, count: params.ids.length },
        'Embeddings stored in ChromaDB',
      );
    } catch (error) {
      throw new EmbeddingError(
        `ChromaDB store failed: ${String(error)}`,
        { entityType: params.entityType, count: params.ids.length },
      );
    }
  }

  /**
   * Query ChromaDB for similar embeddings.
   */
  async query(params: {
    entityType: string;
    queryEmbedding: number[];
    topK?: number;
    where?: Record<string, string>;
  }): Promise<{
    ids: string[];
    documents: (string | null)[];
    distances: number[];
    metadatas: (Record<string, string | number | boolean> | null)[];
  }> {
    try {
      const collection = await this.getCollection(params.entityType);

      const result = await collection.query({
        queryEmbeddings: [params.queryEmbedding],
        nResults: params.topK ?? 10,
        where: params.where,
      });

      return {
        ids: result.ids[0] ?? [],
        documents: result.documents[0] ?? [],
        distances: result.distances?.[0] ?? [],
        metadatas: (result.metadatas?.[0] ?? []) as (Record<string, string | number | boolean> | null)[],
      };
    } catch (error) {
      throw new EmbeddingError(
        `ChromaDB query failed: ${String(error)}`,
        { entityType: params.entityType },
      );
    }
  }
}
