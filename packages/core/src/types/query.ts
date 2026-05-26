import type { EmbeddingSearchResult } from './embedding.js';

export interface QueryRequest {
  question: string;
  repoId: string;
  topK?: number;
  format?: 'text' | 'json';
}

export interface QuerySource {
  type: 'commit' | 'pull_request' | 'issue' | 'file';
  id: string;
  summary: string;
  relevanceScore: number;
}

export interface RetrievalContext {
  chunks: EmbeddingSearchResult[];
  relatedCommitShas: string[];
  relatedPRNumbers: number[];
  relatedFilePaths: string[];
}

export interface QueryResponse {
  answer: string;
  sources: QuerySource[];
  repoId: string;
  question: string;
}
