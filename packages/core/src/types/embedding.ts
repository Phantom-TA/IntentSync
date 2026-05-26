export type EmbeddingEntityType = 'commit' | 'pull_request' | 'issue' | 'file';

export interface EmbeddingChunk {
  id: string;
  entityType: EmbeddingEntityType;
  entityId: string;
  chunkIndex: number;
  chunkText: string;
  repoId: string;
  chromaId?: string;
  metadata: Record<string, string | number | boolean>;
}

export interface EmbeddingSearchResult {
  chunk: EmbeddingChunk;
  score: number;
}
