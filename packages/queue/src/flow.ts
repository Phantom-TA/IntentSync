import { FlowProducer, FlowJob, Queue } from 'bullmq';
import { QUEUE_NAMES } from '@intentsync/core';
import { getSharedRedisConnection } from './connection.js';
import type { ProviderConfig } from '@intentsync/repository-provider';

export interface SyncFlowOptions {
  incremental: boolean;
  maxCommits: number;
  fetchDiffs: boolean;
  maxDiffCommits: number;
  skipPersist: boolean;
  skipEmbed: boolean;
}

/**
 * Builds and schedules a BullMQ flow for executing repository synchronization in the background.
 *
 * Critical path (fast):  ingest → embeddings → graph → sync
 * Fire-and-forget:       ingest → ai.summarize (runs independently, never blocks the main flow)
 *
 * AI summarization is intentionally off the critical path:
 * - It is rate-limited by the Gemini free tier (5 req/min)
 * - Summaries are also generated lazily on first `ask` query via getCachedSummary
 * - Blocking graph/sync on summaries would cause multi-minute delays
 */
export async function addSyncFlow(
  providerConfig: ProviderConfig,
  opts: SyncFlowOptions,
): Promise<{ jobId: string }> {
  const connection = getSharedRedisConnection();
  const flowProducer = new FlowProducer({ connection });

  const targetName = providerConfig.type === 'github'
    ? `${providerConfig.owner}/${providerConfig.repo}`
    : providerConfig.repoPath;

  // Base child job: Ingestion (always runs first)
  let currentChild: FlowJob = {
    name: 'ingest',
    queueName: QUEUE_NAMES.REPO_INGEST,
    data: { providerConfig, opts },
  };

  if (!opts.skipPersist) {
    // Embeddings: wait for ingest to finish
    if (!opts.skipEmbed) {
      currentChild = {
        name: 'embeddings',
        queueName: QUEUE_NAMES.EMBEDDINGS_GENERATE,
        data: {},
        children: [currentChild],
      };
    }

    // Graph: waits for embeddings (or ingest if skipped)
    currentChild = {
      name: 'graph',
      queueName: QUEUE_NAMES.GRAPH_BUILD,
      data: {},
      children: [currentChild],
    };
  }

  // Root job: completes fast once graph is done
  const flow: FlowJob = {
    name: 'sync-complete',
    queueName: QUEUE_NAMES.REPO_SYNC,
    data: { targetName },
    children: [currentChild],
  };

  const node = await flowProducer.add(flow);
  if (!node.job || !node.job.id) {
    throw new Error('Failed to generate flow job ID in BullMQ');
  }

  // Fire-and-forget: queue AI summarization independently.
  // It runs at its own pace, retrying on rate limits, without blocking sync completion.
  if (!opts.skipPersist) {
    const summarizeQueue = new Queue(QUEUE_NAMES.AI_SUMMARIZE, { connection });
    await summarizeQueue.add('summarize', {
      providerConfig,
      opts,
    }, {
      // Low priority — runs after the critical path jobs
      priority: 10,
      attempts: 1,
    });
    await summarizeQueue.close();
  }

  return { jobId: node.job.id };
}
