import { Command } from 'commander';
import { runIngestionPipeline } from '@intentsync/ingestion';
import { getConfig } from '@intentsync/core';
import { getDbClient, persistIngestionResult, disconnectDb } from '@intentsync/db';
import { GeminiEmbeddingProvider, runEmbeddingPipeline } from '@intentsync/embeddings';
import type { ProviderConfig } from '@intentsync/repository-provider';
import {
  printHeader,
  printKeyValue,
  printSuccess,
  printError,
  printInfo,
  printDivider,
  printWarning,
} from '../utils/output.js';

export const syncCommand = new Command('sync')
  .description('Ingest and synchronise a repository')
  .option('--repo <owner/repo>', 'GitHub repository to sync')
  .option('--local <path>', 'Local Git repository path to sync')
  .option('--incremental', 'Only sync commits since last sync', false)
  .option('--max-commits <number>', 'Maximum number of commits to fetch', '500')
  .option('--no-diffs', 'Skip diff extraction (faster)')
  .option('--max-diff-commits <number>', 'Max commits to fetch diffs for', '100')
  .option('--skip-persist', 'Skip PostgreSQL persistence', false)
  .option('--skip-embed', 'Skip embedding generation', false)
  .option('-a, --async', 'Run sync asynchronously in the background via BullMQ', false)
  .action(
    async (opts: {
      repo?: string;
      local?: string;
      incremental: boolean;
      maxCommits: string;
      diffs: boolean;
      maxDiffCommits: string;
      skipPersist: boolean;
      skipEmbed: boolean;
      async: boolean;
    }) => {
      if (!opts.repo && !opts.local) {
        printError('Provide either --repo <owner/repo> or --local <path>');
        process.exit(1);
      }

      try {
        const config = getConfig();

        // Build provider config
        let providerConfig: ProviderConfig;

        if (opts.repo) {
          const [owner, repo] = opts.repo.split('/');
          if (!owner || !repo) {
            printError('--repo must be in the format owner/repo');
            process.exit(1);
          }
          if (!config.GITHUB_TOKEN) {
            printError('GITHUB_TOKEN is required for GitHub repositories.');
            process.exit(1);
          }
          providerConfig = {
            type: 'github',
            owner,
            repo,
            token: config.GITHUB_TOKEN,
          };
        } else {
          providerConfig = {
            type: 'local',
            repoPath: opts.local!,
          };
        }

        if (opts.async) {
          const { addSyncFlow, closeSharedRedisConnection } = await import('@intentsync/queue');
          const { jobId } = await addSyncFlow(providerConfig, {
            incremental: opts.incremental,
            maxCommits: parseInt(opts.maxCommits, 10),
            fetchDiffs: opts.diffs,
            maxDiffCommits: parseInt(opts.maxDiffCommits, 10),
            skipPersist: opts.skipPersist,
            skipEmbed: opts.skipEmbed,
          });
          printSuccess('Sync job successfully queued to BullMQ.');
          printKeyValue('Job ID', jobId);
          printInfo("Run 'intentsync worker' to start processing the queue.");
          await closeSharedRedisConnection();
          return;
        }

        const target = opts.repo ?? opts.local!;
        printHeader(`Syncing: ${target}`);
        printKeyValue('Mode', opts.incremental ? 'incremental' : 'full');
        printKeyValue('Max Commits', opts.maxCommits);
        printKeyValue('Fetch Diffs', opts.diffs ? 'yes' : 'no');
        printKeyValue('Persist to DB', opts.skipPersist ? 'skipped' : 'yes');
        printKeyValue('Generate Embeddings', opts.skipEmbed ? 'skipped' : 'yes');
        printInfo('');

        // ── Step 1: Ingestion ─────────────────────────────────────
        printInfo('Step 1/4 — Running ingestion pipeline...');
        printDivider();

        const result = await runIngestionPipeline(providerConfig, {
          maxCommits: parseInt(opts.maxCommits, 10),
          fetchDiffs: opts.diffs,
          maxDiffCommits: parseInt(opts.maxDiffCommits, 10),
        });

        printHeader('Ingestion Complete');
        printKeyValue('Repository', `${result.metadata.owner}/${result.metadata.name}`);
        printKeyValue('Source', result.metadata.source);
        printKeyValue('Branch', result.metadata.defaultBranch);
        printDivider();
        printKeyValue('Commits', String(result.stats.commitCount));
        printKeyValue('Diffs Fetched', String(result.stats.diffCount));
        printKeyValue('Files in Tree', String(result.stats.fileCount));
        printKeyValue('Pull Requests', String(result.stats.prCount));
        printKeyValue('Issues', String(result.stats.issueCount));
        printKeyValue('Contributors', String(result.stats.contributorCount));
        printKeyValue('Duration', `${(result.stats.durationMs / 1000).toFixed(2)}s`);

        // ── Step 2: Persistence ───────────────────────────────────
        let repoDbId: string | undefined;

        if (!opts.skipPersist) {
          printInfo('');
          printInfo('Step 2/4 — Persisting to PostgreSQL...');
          printDivider();

          try {
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

            repoDbId = persistResult.repoId;
            printKeyValue('Commits Persisted', String(persistResult.commitsPersisted));
            printKeyValue('PRs Persisted', String(persistResult.prsPersisted));
            printKeyValue('Issues Persisted', String(persistResult.issuesPersisted));
            printKeyValue('Files Persisted', String(persistResult.filesPersisted));
            printKeyValue('Developers Persisted', String(persistResult.developersPersisted));
            printKeyValue('Duration', `${(persistResult.durationMs / 1000).toFixed(2)}s`);
            printSuccess('Data persisted to PostgreSQL.');
          } catch (error) {
            printWarning(`Persistence failed: ${error instanceof Error ? error.message : String(error)}`);
            printWarning('Continuing without persistence. Ensure PostgreSQL is running.');
          }
        } else {
          printInfo('');
          printInfo('Step 2/4 — Persistence skipped (--skip-persist)');
        }

        // ── Step 3: Embeddings ────────────────────────────────────
        if (!opts.skipEmbed) {
          printInfo('');
          printInfo('Step 3/4 — Generating embeddings...');
          printDivider();

          try {
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
              repoDbId ?? result.metadata.id,
              {
                commits: result.commits,
                pullRequests: result.pullRequests,
                issues: result.issues,
              },
            );

            printKeyValue('Chunks Generated', String(embedResult.chunksGenerated));
            printKeyValue('Embeddings Stored', String(embedResult.embeddingsStored));
            printKeyValue('Duration', `${(embedResult.durationMs / 1000).toFixed(2)}s`);
            printSuccess('Embeddings stored in ChromaDB.');
          } catch (error) {
            printWarning(`Embedding failed: ${error instanceof Error ? error.message : String(error)}`);
            printWarning('Continuing without embeddings. Ensure ChromaDB is running and GEMINI_API_KEY is valid.');
          }
        } else {
          printInfo('');
          printInfo('Step 3/4 — Embeddings skipped (--skip-embed)');
        }

        // ── Step 4: Graph Database (Neo4j) ────────────────────────
        if (repoDbId) {
          printInfo('');
          printInfo('Step 4/4 — Synchronising Graph Database (Neo4j)...');
          printDivider();

          try {
            const db = getDbClient();
            const dbDevelopers = await db.developer.findMany({
              where: { repoId: repoDbId },
              select: { id: true, login: true },
            });
            const dbFiles = await db.file.findMany({
              where: { repoId: repoDbId },
              select: { id: true, path: true },
            });
            const dbCommits = await db.commit.findMany({
              where: { repoId: repoDbId },
              include: { author: true },
            });

            const graphInput = {
              repoId: repoDbId,
              owner: result.metadata.owner,
              name: result.metadata.name,
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
            };

            const { verifyNeo4jConnection, syncGraph, closeNeo4jDriver } = await import('@intentsync/graph');
            const neo4jHealthy = await verifyNeo4jConnection();
            if (neo4jHealthy) {
              const graphStart = Date.now();
              await syncGraph(graphInput);
              printKeyValue('Nodes/Edges Synced', `${graphInput.commits.length} commits, ${graphInput.files.length} files`);
              printKeyValue('Duration', `${((Date.now() - graphStart) / 1000).toFixed(2)}s`);
              printSuccess('Graph database synchronized with Neo4j.');
            } else {
              printWarning('Neo4j connection could not be verified. Skipping graph sync.');
            }
            await closeNeo4jDriver().catch(() => {});
          } catch (error) {
            printWarning(`Graph sync failed: ${error instanceof Error ? error.message : String(error)}`);
            printWarning('Continuing without Graph Sync. Ensure Neo4j is running.');
          }
        } else {
          printInfo('');
          printInfo('Step 4/4 — Graph Database skipped (requires active PostgreSQL persistence)');
        }

        // ── Summary ───────────────────────────────────────────────
        printInfo('');
        printHeader('Sync Summary');

        if (result.commits.length > 0) {
          printInfo('Recent Commits (last 5):');
          for (const commit of result.commits.slice(0, 5)) {
            const sha = commit.sha.slice(0, 7);
            const date = commit.timestamp.toISOString().slice(0, 10);
            const msg =
              commit.message.length > 70
                ? commit.message.slice(0, 67) + '...'
                : commit.message;
            printKeyValue(`  ${sha} (${date})`, msg.split('\n')[0]!);
          }
        }

        printInfo('');
        printSuccess('Sync complete.');

        // Clean up
        if (!opts.skipPersist) {
          await disconnectDb();
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        await disconnectDb().catch(() => {});
        process.exit(1);
      }
    },
  );
