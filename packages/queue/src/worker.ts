import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, getConfig } from '@intentsync/core';
import { getRedisConnectionOptions } from './connection.js';
import { createLogger } from '@intentsync/logger';
import { runIngestionPipeline } from '@intentsync/ingestion';
import { getDbClient, persistIngestionResult } from '@intentsync/db';
import { GeminiEmbeddingProvider, runEmbeddingPipeline } from '@intentsync/embeddings';
import { GeminiChatClient, storeSummary } from '@intentsync/ai-engine';

const log = createLogger('queue:worker');

/**
 * Extracts the suggested retry delay (in ms) from a Gemini 429 error message.
 * Falls back to the provided default if the message doesn't include timing info.
 */
function extractRetryDelayMs(err: unknown, defaultMs = 15_000): number {
  const msg = String(err);
  // Gemini includes e.g. "Please retry in 46.651s" in the error message
  const match = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 1000; // add 1s buffer
  }
  return defaultMs;
}

/**
 * Calls fn(), retrying up to maxRetries times when a 429 rate-limit error is hit.
 * Waits exactly as long as Gemini tells us to before retrying.
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const is429 = String(err).includes('429') || String(err).includes('Too Many Requests');
      if (is429 && attempt < maxRetries) {
        attempt++;
        const waitMs = extractRetryDelayMs(err);
        log.warn(
          { label, attempt, waitMs },
          `Rate limited by Gemini — waiting ${waitMs}ms before retry ${attempt}/${maxRetries}`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
}

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
  const connection = getRedisConnectionOptions();
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

  // 3. AI Summarize Worker (fire-and-forget — NOT on the critical sync path)
  // Runs independently at its own pace. Retries on Gemini rate limits.
  // Summaries are also generated lazily on first `ask` query, so no blocking needed.
  const summarizeWorker = new Worker(
    QUEUE_NAMES.AI_SUMMARIZE,
    async (job) => {
      const { providerConfig } = job.data;

      // Resolve repoId from the provider config (mirrors how ingestion does it)
      const targetId = providerConfig.type === 'github'
        ? `github:${providerConfig.owner}/${providerConfig.repo}`
        : `local:${providerConfig.repoPath}`;

      const db = getDbClient();

      // Look up the persisted repo record by its source ID
      const repo = await db.repository.findFirst({
        where: { id: { contains: targetId.split(':')[1] } },
        orderBy: { createdAt: 'desc' },
      });

      if (!repo) {
        log.warn({ targetId }, 'AI summarize: repo not found in DB, skipping');
        return { summarizedCommits: 0, summarizedPRs: 0 };
      }

      const repoId = repo.id;
      log.info({ jobId: job.id, repoId }, 'Starting AI summary worker job (fire-and-forget)');

      const aiClient = new GeminiChatClient({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_CHAT_MODEL,
      });

      const commits = await db.commit.findMany({
        where: { repoId, aiSummary: null },
        take: 30,
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
          const response = await retryWithBackoff(
            () => aiClient.complete(prompt),
            `commit:${commit.sha.slice(0, 8)}`,
          );
          await storeSummary(db, 'commit', commit.sha, repoId, response.text.trim());
          summarizedCommits++;
        } catch (err) {
          log.warn({ sha: commit.sha, err: String(err) }, 'Failed to generate commit summary after retries');
        }
      }

      for (const pr of prs) {
        try {
          const prompt = `Provide a concise 1-2 sentence summary of this pull request.
Title: ${pr.title}
Body: ${pr.body || '(No body provided)'}
State: ${pr.state}`;
          const response = await retryWithBackoff(
            () => aiClient.complete(prompt),
            `pr:${pr.number}`,
          );
          await storeSummary(db, 'pull_request', String(pr.number), repoId, response.text.trim());
          summarizedPRs++;
        } catch (err) {
          log.warn({ prNumber: pr.number, err: String(err) }, 'Failed to generate PR summary after retries');
        }
      }

      log.info({ repoId, summarizedCommits, summarizedPRs }, 'AI summarization complete');
      return { repoId, summarizedCommits, summarizedPRs };
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
