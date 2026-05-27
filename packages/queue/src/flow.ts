import { FlowProducer, FlowJob } from 'bullmq';
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
 * Uses a linear parent-child chain to guarantee step-by-step correct execution.
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
    data: {
      providerConfig,
      opts,
    },
  };

  // If persisting, chain subsequent operations
  if (!opts.skipPersist) {
    // Generate Embeddings
    if (!opts.skipEmbed) {
      currentChild = {
        name: 'embeddings',
        queueName: QUEUE_NAMES.EMBEDDINGS_GENERATE,
        data: {},
        children: [currentChild],
      };
    }

    // AI Summarization
    currentChild = {
      name: 'summarize',
      queueName: QUEUE_NAMES.AI_SUMMARIZE,
      data: {},
      children: [currentChild],
    };

    // Graph database build
    currentChild = {
      name: 'graph',
      queueName: QUEUE_NAMES.GRAPH_BUILD,
      data: {},
      children: [currentChild],
    };
  }

  // Root job: finalize sync stats
  const flow: FlowJob = {
    name: 'sync-complete',
    queueName: QUEUE_NAMES.REPO_SYNC,
    data: {
      targetName,
    },
    children: [currentChild],
  };

  const node = await flowProducer.add(flow);
  if (!node.job || !node.job.id) {
    throw new Error('Failed to generate flow job ID in BullMQ');
  }

  return { jobId: node.job.id };
}
