/** BullMQ queue names — defined here for consistency. Used from Phase 7. */
export const QUEUE_NAMES = {
  REPO_INGEST: 'repo.ingest',
  REPO_SYNC: 'repo.sync',
  GITHUB_SYNC: 'github.sync',
  AI_SUMMARIZE: 'ai.summarize',
  EMBEDDINGS_GENERATE: 'embeddings.generate',
  GRAPH_BUILD: 'graph.build',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
