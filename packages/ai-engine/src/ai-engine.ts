import type { PrismaClient } from '@prisma/client';
import { RetrievalError } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';
import type { RankedContext } from '@intentsync/retrieval';
import { buildPrompt } from './prompt-builder.js';
import { GeminiChatClient } from './gemini-chat.js';
import { storeSummary } from './summary-cache.js';

export interface AiEngineOptions {
  apiKey: string;
  chatModel: string;
}

export interface AiAnswer {
  answer: string;
  /** Source citations derived from the ranked context */
  sources: AiSource[];
  modelUsed: string;
  promptTokenEstimate: number;
  durationMs: number;
}

export interface AiSource {
  type: 'commit' | 'pull_request' | 'issue';
  id: string;
  label: string;
}

/**
 * Derives a human-readable list of sources from the ranked context.
 * Used to populate the sources section in the CLI output.
 */
function deriveSources(context: RankedContext): AiSource[] {
  const sources: AiSource[] = [];

  for (const commit of context.commits.slice(0, 8)) {
    sources.push({
      type: 'commit',
      id: commit.sha,
      label: `commit ${commit.sha.slice(0, 8)} — "${commit.message.split('\n')[0]?.slice(0, 72) ?? ''}"`,
    });
  }

  for (const pr of context.pullRequests.slice(0, 5)) {
    sources.push({
      type: 'pull_request',
      id: String(pr.number),
      label: `PR #${pr.number} — "${pr.title.slice(0, 72)}" [${pr.state}]`,
    });
  }

  for (const issue of context.issues.slice(0, 5)) {
    sources.push({
      type: 'issue',
      id: String(issue.number),
      label: `issue #${issue.number} — "${issue.title.slice(0, 72)}" [${issue.state}]`,
    });
  }

  return sources;
}

/**
 * AiEngine orchestrates:
 *   RankedContext → prompt → Gemini 2.5 Flash → parsed answer → lazy cache write
 */
export class AiEngine {
  private chatClient: GeminiChatClient;
  private log = createLogger('ai-engine');

  constructor(options: AiEngineOptions) {
    this.chatClient = new GeminiChatClient({
      apiKey: options.apiKey,
      model: options.chatModel,
    });
  }

  /**
   * Generate a historically-grounded answer for a question given ranked context.
   *
   * @param context  Retrieved and ranked context from RetrievalEngine
   * @param db       Optional PrismaClient for lazy summary caching
   */
  async answer(context: RankedContext, db: PrismaClient | null = null): Promise<AiAnswer> {
    const start = Date.now();

    this.log.info(
      {
        question: context.query.slice(0, 80),
        chunks: context.chunks.length,
        commits: context.commits.length,
        prs: context.pullRequests.length,
      },
      'Building AI answer',
    );

    if (context.chunks.length === 0) {
      return {
        answer:
          'No indexed data was found for this repository. ' +
          'Run `intentsync sync --repo <owner/repo>` to index it first.',
        sources: [],
        modelUsed: 'none',
        promptTokenEstimate: 0,
        durationMs: Date.now() - start,
      };
    }

    try {
      // Build prompt from ranked context
      const prompt = buildPrompt(context.query, context);
      // Rough token estimate: ~4 chars per token
      const promptTokenEstimate = Math.ceil(prompt.length / 4);

      this.log.debug({ promptTokenEstimate }, 'Prompt built');

      // Call Gemini
      const chatResponse = await this.chatClient.complete(prompt);

      const sources = deriveSources(context);
      const durationMs = Date.now() - start;

      // Lazily cache AI summaries for top commits and PRs (fire-and-forget)
      if (db) {
        void this.cacheTopEntitySummaries(context, chatResponse.text, db);
      }

      this.log.info(
        { durationMs, sources: sources.length, model: chatResponse.modelUsed },
        'AI answer complete',
      );

      return {
        answer: chatResponse.text,
        sources,
        modelUsed: chatResponse.modelUsed,
        promptTokenEstimate,
        durationMs,
      };
    } catch (error) {
      if (error instanceof RetrievalError) throw error;
      throw new RetrievalError(
        `AI engine failed: ${String(error)}`,
        { question: context.query },
      );
    }
  }

  /**
   * Fire-and-forget: cache the AI answer as a summary for the top commit and PR
   * referenced in this context, so future queries skip the Gemini call for those.
   */
  private async cacheTopEntitySummaries(
    context: RankedContext,
    answerText: string,
    db: PrismaClient,
  ): Promise<void> {
    // Only cache if the answer is substantial
    if (answerText.length < 100) return;

    const topCommit = context.commits[0];
    if (topCommit && !topCommit.aiSummary) {
      // Store a shorter distilled version as the commit's individual summary
      const commitSummary = answerText.slice(0, 500);
      await storeSummary(db, 'commit', topCommit.sha, context.repoId, commitSummary);
    }

    const topPR = context.pullRequests[0];
    if (topPR && !topPR.aiSummary) {
      const prSummary = answerText.slice(0, 500);
      await storeSummary(db, 'pull_request', String(topPR.number), context.repoId, prSummary);
    }
  }
}
