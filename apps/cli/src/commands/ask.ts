import { Command } from 'commander';
import { getConfig } from '@intentsync/core';
import { getDbClient, disconnectDb } from '@intentsync/db';
import { RetrievalEngine } from '@intentsync/retrieval';
import { AiEngine } from '@intentsync/ai-engine';
import {
  printHeader,
  printKeyValue,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printDivider,
  printJson,
} from '../utils/output.js';
import chalk from 'chalk';

export const askCommand = new Command('ask')
  .description('Ask a natural language question about a repository')
  .argument('<question>', 'Your question about the repository')
  .option('--repo <owner/repo>', 'GitHub repository to query')
  .option('--local <path>', 'Local repository path to query')
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--depth <number>', 'Number of context chunks to retrieve', '10')
  .option('--skip-cache', 'Skip reading/writing the AI summary cache', false)
  .action(
    async (
      question: string,
      opts: {
        repo?: string;
        local?: string;
        format: string;
        depth: string;
        skipCache: boolean;
      },
    ) => {
      if (!opts.repo && !opts.local) {
        printError('Provide either --repo <owner/repo> or --local <path>');
        process.exit(1);
      }

      const topK = Math.max(1, Math.min(50, parseInt(opts.depth, 10) || 10));
      const target = opts.repo ?? opts.local!;

      if (opts.format === 'text') {
        printHeader('IntentSync — Repository Query');
        printKeyValue('Question', question);
        printKeyValue('Repository', target);
        printKeyValue('Depth', String(topK));
        printInfo('');
      }

      try {
        const config = getConfig();

        // ── Step 1: Resolve repoId from PostgreSQL ────────────────
        let db: Awaited<ReturnType<typeof getDbClient>> | null = null;
        let repoId: string | null = null;

        try {
          db = getDbClient();

          // Determine how to look up the repo
          if (opts.repo) {
            const parts = opts.repo.split('/');
            const owner = parts[0];
            const name = parts[1];
            if (!owner || !name) {
              printError('--repo must be in the format owner/repo');
              process.exit(1);
            }
            const repo = await db.repository.findUnique({
              where: { owner_name: { owner, name } },
              select: { id: true },
            });
            repoId = repo?.id ?? null;
          } else if (opts.local) {
            // Local repos are keyed by directory name as the repo "name"
            const localName = opts.local.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
            const repo = await db.repository.findFirst({
              where: { name: localName, source: 'local' },
              select: { id: true },
              orderBy: { lastSyncedAt: 'desc' },
            });
            repoId = repo?.id ?? null;
          }

          if (!repoId) {
            printError(
              `Repository "${target}" is not indexed yet.\n` +
                `  Run: intentsync sync ${opts.repo ? '--repo ' + opts.repo : '--local ' + opts.local!}`,
            );
            await disconnectDb();
            process.exit(1);
          }
        } catch (dbError) {
          printWarning(
            `PostgreSQL unavailable: ${dbError instanceof Error ? dbError.message : String(dbError)}`,
          );
          printWarning('Proceeding without entity hydration. Results may be less rich.');
          // repoId stays null — retrieval will still work against ChromaDB using the
          // owner/repo string as a best-effort repoId
          repoId = opts.repo ?? opts.local ?? target;
          db = null;
        }

        // ── Step 2: Retrieve ranked context ───────────────────────
        if (opts.format === 'text') {
          printInfo('Searching repository history...');
        }

        const retrieval = new RetrievalEngine({
          geminiApiKey: config.GEMINI_API_KEY,
          embeddingModel: config.GEMINI_EMBEDDING_MODEL,
          chromaHost: config.CHROMA_HOST,
          chromaCollectionPrefix: config.CHROMA_COLLECTION_PREFIX,
        });

        const context = await retrieval.retrieve(question, repoId, topK, db);

        if (context.chunks.length === 0) {
          printWarning('No indexed data found for this repository.');
          printInfo(
            `Run: intentsync sync ${opts.repo ? '--repo ' + opts.repo : '--local ' + opts.local!}`,
          );
          await disconnectDb();
          process.exit(0);
        }

        if (opts.format === 'text') {
          printKeyValue('Chunks Retrieved', String(context.chunks.length));
          printKeyValue('Commits Found', String(context.commits.length));
          printKeyValue('PRs Found', String(context.pullRequests.length));
          printKeyValue('Issues Found', String(context.issues.length));
          printInfo('Generating answer...');
          printDivider();
        }

        // ── Step 3: Generate AI answer ────────────────────────────
        const aiEngine = new AiEngine({
          apiKey: config.GEMINI_API_KEY,
          chatModel: config.GEMINI_CHAT_MODEL,
        });

        const aiAnswer = await aiEngine.answer(context, opts.skipCache ? null : db);

        // ── Step 4: Render output ─────────────────────────────────
        if (opts.format === 'json') {
          printJson({
            question,
            repository: target,
            answer: aiAnswer.answer,
            sources: aiAnswer.sources,
            meta: {
              chunksRetrieved: context.chunks.length,
              commitsFound: context.commits.length,
              prsFound: context.pullRequests.length,
              issuesFound: context.issues.length,
              modelUsed: aiAnswer.modelUsed,
              promptTokenEstimate: aiAnswer.promptTokenEstimate,
              retrievalMs: context.durationMs,
              totalMs: aiAnswer.durationMs,
            },
          });
        } else {
          // Text output
          console.log('');
          console.log(chalk.bold.white('Answer:'));
          console.log('');
          console.log(chalk.white(aiAnswer.answer));
          console.log('');

          if (aiAnswer.sources.length > 0) {
            printDivider();
            console.log(chalk.bold.gray('Sources:'));
            for (const source of aiAnswer.sources) {
              const icon =
                source.type === 'commit'
                  ? chalk.yellow('◆')
                  : source.type === 'pull_request'
                    ? chalk.blue('⬡')
                    : chalk.magenta('◉');
              console.log(`  ${icon} ${chalk.gray(source.label)}`);
            }
            console.log('');
          }

          printKeyValue('Model', aiAnswer.modelUsed);
          printKeyValue('Retrieval', `${context.durationMs}ms`);
          printKeyValue('AI Generation', `${aiAnswer.durationMs}ms`);
          printSuccess('Query complete.');
        }

        await disconnectDb();
      } catch (error) {
        if (opts.format === 'json') {
          printJson({
            error: error instanceof Error ? error.message : String(error),
            question,
            repository: target,
          });
        } else {
          printError(error instanceof Error ? error.message : String(error));
        }
        await disconnectDb().catch(() => {});
        process.exit(1);
      }
    },
  );
