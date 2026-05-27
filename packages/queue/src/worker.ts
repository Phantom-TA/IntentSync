import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, getConfig } from '@intentsync/core';
import { createRedisConnection } from './connection.js';
import { createLogger } from '@intentsync/logger';
import { runIngestionPipeline } from '@intentsync/ingestion';
import { getDbClient, persistIngestionResult } from '@intentsync/db';
import { GeminiEmbeddingProvider, runEmbeddingPipeline } from '@intentsync/embeddings';
import { GeminiChatClient, storeSummary } from '@intentsync/ai-engine';

const log = createLogger('queue:worker');

/**
 * Extracts the repoId from children values in BullMQ.
 */
async function extractRepoIdFromChildren(job: Job): Promise<string> {
  const childrenValues = await job.getChildrenValues();
  // Find the child return value containing repoId
  for (const value of Object.values(childrenValues)) {
    if (value && typeof value === 'object' && 'repoId' in value) {
      return (value as { repoId: string }).repoId;
    }
  }
  throw new Error(`Could not resolve repoId from children values of job ${job.id}`);
}

/**
 * Starts all workers for the monorepo sync flow.
 */
export function startWorkers(): Worker[] {
  const connection = createRedisConnection();
  const config = getConfig();

  // 1. Ingestion Worker
  const ingestWorker = new Worker(
    QUEUE_NAMES.REPO_INGEST,
    async (job) => {
      const { providerConfig, opts } = job.data;
      log.info({ jobId: job.id, type: providerConfig.type }, 'Starting ingestion worker job');

      const result = await runIngestionPipeline(providerConfig, {
        maxCommits: Number(opts.maxCommits),
        fetchDiffs: opts.fetchDiffs,
        maxDiffCommits: Number(opts.maxDiffCommits),
      });

      let repoId = result.metadata.id;

      if (!opts.skipPersist) {
        log.info('Persisting ingestion results to PostgreSQL...');
        const db = getDbClient();
        const persistResult = await persistIngestionResult(db, {
          metadata: result.metadata,
          commits: result.commits,
          diffs: result.diffs,
          fileTree: result.fileTree,
          pullRequests: result.pullRequests,
          issues: result.issues,
          contributors: result.contributors,
        });
        repoId = persistResult.repoId;
        log.info({ repoId }, 'Ingestion results persisted');
      }

      return {
        repoId,
        metadata: result.metadata,
        stats: result.stats,
      };
    },
    { connection, concurrency: 1 },
  );

  // 2. Embeddings Worker
  const embeddingsWorker = new Worker(
    QUEUE_NAMES.EMBEDDINGS_GENERATE,
    async (job) => {
      const repoId = await extractRepoIdFromChildren(job);
      log.info({ jobId: job.id, repoId }, 'Starting embeddings worker job');

      const db = getDbClient();
      // Load and map from DB to avoid passing huge payloads via Redis
      const commits = await db.commit.findMany({
        where: { repoId },
        include: { author: true },
      });
      const pullRequests = await db.pullRequest.findMany({
        where: { repoId },
      });
      const issues = await db.issue.findMany({
        where: { repoId },
      });

      const embeddingProvider = new GeminiEmbeddingProvider(
        config.GEMINI_API_KEY,
        config.GEMINI_EMBEDDING_MODEL,
      );

      const embedResult = await runEmbeddingPipeline(
        embeddingProvider,
        {
          chromaHost: config.CHROMA_HOST,
          chromaCollectionPrefix: config.CHROMA_COLLECTION_PREFIX,
        },
        repoId,
        {
          commits: commits.map((c) => ({
            sha: c.sha,
            message: c.message,
            authorLogin: c.author.login,
            authorEmail: c.author.email || '',
            timestamp: c.timestamp,
            filesChanged: c.filesChanged,
            additions: c.additions,
            deletions: c.deletions,
            parents: c.parents,
          })),
          pullRequests: pullRequests.map((pr) => ({
            number: pr.number,
            title: pr.title,
            body: pr.body || undefined,
            state: pr.state as 'open' | 'closed' | 'merged',
            authorLogin: pr.authorLogin,
            commitShas: pr.commitShas,
            createdAt: pr.createdAt,
            mergedAt: pr.mergedAt || undefined,
            labels: pr.labels,
          })),
          issues: issues.map((iss) => ({
            number: iss.number,
            title: iss.title,
            body: iss.body || undefined,
            state: iss.state as 'open' | 'closed',
            authorLogin: iss.authorLogin,
            labels: iss.labels,
            createdAt: iss.createdAt,
            closedAt: iss.closedAt || undefined,
            referencedPRNumbers: iss.referencedPRNumbers,
          })),
        },
      );

      return {
        repoId,
        chunksGenerated: embedResult.chunksGenerated,
        embeddingsStored: embedResult.embeddingsStored,
      };
    },
    { connection, concurrency: 1 },
  );

  // 3. AI Summarize Worker
  const summarizeWorker = new Worker(
    QUEUE_NAMES.AI_SUMMARIZE,
    async (job) => {
      const repoId = await extractRepoIdFromChildren(job);
      log.info({ jobId: job.id, repoId }, 'Starting AI summary worker job');

      const db = getDbClient();
      const aiClient = new GeminiChatClient({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_CHAT_MODEL,
      });

      // Find commits and pull requests missing summaries
      const commits = await db.commit.findMany({
        where: { repoId, aiSummary: null },
        take: 30, // limit batch to avoid excessive API requests
      });

      const prs = await db.pullRequest.findMany({
        where: { repoId, aiSummary: null },
        take: 10,
      });

      let summarizedCommits = 0;
      let summarizedPRs = 0;

      for (const commit of commits) {
        try {
          const prompt = `Provide a concise 1-2 sentence summary of this commit. Focus on key logical or structural changes.
Message: ${commit.message}
Files changed: ${commit.filesChanged.join(', ')}`;
          const response = await aiClient.complete(prompt);
          await storeSummary(db, 'commit', commit.sha, repoId, response.text.trim());
          summarizedCommits++;
          // sleep 150ms to avoid rate limit spikes
          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          log.warn({ sha: commit.sha, err: String(err) }, 'Failed to generate commit summary');
        }
      }

      for (const pr of prs) {
        try {
          const prompt = `Provide a concise 1-2 sentence summary of this pull request.
Title: ${pr.title}
Body: ${pr.body || '(No body provided)'}
State: ${pr.state}`;
          const response = await aiClient.complete(prompt);
          await storeSummary(db, 'pull_request', String(pr.number), repoId, response.text.trim());
          summarizedPRs++;
          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          log.warn({ prNumber: pr.number, err: String(err) }, 'Failed to generate PR summary');
        }
      }

      return {
        repoId,
        summarizedCommits,
        summarizedPRs,
      };
    },
    { connection, concurrency: 1 },
  );

  // 4. Graph Build Worker
  const graphWorker = new Worker(
    QUEUE_NAMES.GRAPH_BUILD,
    async (job) => {
      const repoId = await extractRepoIdFromChildren(job);
      log.info({ jobId: job.id, repoId }, 'Starting graph build worker job');

      const db = getDbClient();
      const dbDevelopers = await db.developer.findMany({
        where: { repoId },
        select: { id: true, login: true },
      });
      const dbFiles = await db.file.findMany({
        where: { repoId },
        select: { id: true, path: true },
      });
      const dbCommits = await db.commit.findMany({
        where: { repoId },
        include: { author: true },
      });

      const { verifyNeo4jConnection, syncGraph, closeNeo4jDriver } = await import('@intentsync/graph');

      const neo4jHealthy = await verifyNeo4jConnection();
      if (neo4jHealthy) {
        await syncGraph({
          repoId,
          owner: job.data.owner || '', // will get resolved or not needed if neo4j sync is general
          name: job.data.name || '',
          developers: dbDevelopers,
          files: dbFiles,
          commits: dbCommits.map((c) => ({
            id: c.id,
            sha: c.sha,
            message: c.message,
            timestamp: c.timestamp,
            authorLogin: c.author.login,
            filesChanged: c.filesChanged,
          })),
        });
        await closeNeo4jDriver().catch(() => {});
        log.info({ repoId }, 'Graph database sync complete');
      } else {
        log.warn('Neo4j database offline, skipping graph build step');
      }

      return { repoId };
    },
    { connection, concurrency: 1 },
  );

  // 5. Root Sync Status Worker
  const syncWorker = new Worker(
    QUEUE_NAMES.REPO_SYNC,
    async (job) => {
      const { targetName } = job.data;
      log.info({ targetName }, 'Starting final sync status compilation');

      const childrenValues = await job.getChildrenValues();
      log.info({ childrenValues }, 'Background sync flow completed successfully');

      return { success: true };
    },
    { connection, concurrency: 1 },
  );

  // Listen to error/failed events on workers to avoid unhandled promise rejections
  const workers = [ingestWorker, embeddingsWorker, summarizeWorker, graphWorker, syncWorker];

  for (const w of workers) {
    w.on('failed', (job, err) => {
      log.error({ queue: w.name, jobId: job?.id, err: err.message }, 'Job failed in queue');
    });
    w.on('error', (err) => {
      log.error({ queue: w.name, err: err.message }, 'Queue worker encountered a connection error');
    });
  }

  return workers;
}
