import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmbeddingError } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';
import type { EmbeddingProvider } from './embedding-provider.js';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private genAI: GoogleGenerativeAI;
  public readonly modelName: string;
  private log = createLogger('embeddings:gemini');

  constructor(apiKey: string, modelName = 'text-embedding-004') {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });

      // Gemini supports batch embedding
      const result = await model.batchEmbedContents({
        requests: texts.map((text) => ({
          content: { role: 'user', parts: [{ text }] },
        })),
      });

      this.log.debug({ count: texts.length }, 'Embeddings generated');
      return result.embeddings.map((e) => e.values);
    } catch (error) {
      throw new EmbeddingError(
        `Gemini embedding failed: ${String(error)}`,
        { textCount: texts.length },
      );
    }
  }
}
