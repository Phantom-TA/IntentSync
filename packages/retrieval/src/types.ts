/**
 * Shared types for the retrieval pipeline.
 * Kept internal to the package; AiEngine consumes RankedContext via import.
 */

export interface SemanticChunk {
  /** ChromaDB document ID */
  id: string;
  entityType: 'commit' | 'pull_request' | 'issue' | 'file';
  /** The raw entity ID: sha for commits, number string for PRs/issues */
  entityId: string;
  /** The text that was embedded */
  chunkText: string;
  /** ChromaDB cosine distance (0 = identical, 2 = opposite) */
  distance: number;
  /** ChromaDB metadata fields stored at index time */
  metadata: Record<string, string | number | boolean>;
}

/**
 * Objective retrieval confidence derived from ChromaDB similarity scores and evidence count.
 * Used by AiEngine to enhance the prompt and render a final confidence indicator.
 */
export interface RetrievalConfidence {
  /** Average similarity score of top chunks (0.0 = no match, 1.0 = perfect match) */
  avgSimilarity: number;
  /** Number of chunks above the high-relevance threshold (distance < 0.4) */
  highRelevanceChunks: number;
  /** Total entity evidence: commits + PRs + issues retrieved */
  evidenceCount: number;
  /** Computed tier: HIGH | MEDIUM | LOW | INSUFFICIENT */
  tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
}

export interface HydratedCommit {
  sha: string;
  message: string;
  authorLogin: string;
  timestamp: Date;
  filesChanged: string[];
  additions: number;
  deletions: number;
  aiSummary: string | null;
}

export interface HydratedPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  authorLogin: string;
  labels: string[];
  createdAt: Date;
  mergedAt: Date | null;
  aiSummary: string | null;
}

export interface HydratedIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  authorLogin: string;
  labels: string[];
  createdAt: Date;
  closedAt: Date | null;
}

/**
 * Final ranked context ready to be passed to the AI engine.
 */
export interface RankedContext {
  query: string;
  repoId: string;
  /** Semantically retrieved and ranked chunks — primary evidence */
  chunks: SemanticChunk[];
  /** Hydrated commits referenced in the top chunks */
  commits: HydratedCommit[];
  /** Hydrated PRs referenced in the top chunks */
  pullRequests: HydratedPR[];
  /** Hydrated issues referenced in the top chunks */
  issues: HydratedIssue[];
  /** Graph-based co-change warnings from Neo4j (Phase 6) */
  coChanges?: Array<{ sourcePath: string; targetPath: string; weight: number }>;
  /** Objective retrieval confidence computed from ChromaDB similarity scores */
  confidence: RetrievalConfidence;
  durationMs: number;
}
