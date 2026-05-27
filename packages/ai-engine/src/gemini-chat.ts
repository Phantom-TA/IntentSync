import { GoogleGenerativeAI } from '@google/generative-ai';
import { RetrievalError } from '@intentsync/core';
import { createLogger } from '@intentsync/logger';

export interface GeminiChatOptions {
  apiKey: string;
  model: string;
}

export interface ChatResponse {
  text: string;
  modelUsed: string;
  durationMs: number;
}

/**
 * Thin wrapper around Gemini's generateContent API for single-turn completions.
 * Non-streaming. Uses the configured GEMINI_CHAT_MODEL (gemini-2.5-flash).
 */
export class GeminiChatClient {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private log = createLogger('ai-engine:gemini-chat');

  constructor(options: GeminiChatOptions) {
    this.genAI = new GoogleGenerativeAI(options.apiKey);
    this.modelName = options.model;
  }

  async complete(prompt: string): Promise<ChatResponse> {
    const start = Date.now();
    this.log.debug({ model: this.modelName, promptLen: prompt.length }, 'Calling Gemini');

    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      const durationMs = Date.now() - start;
      this.log.info(
        { model: this.modelName, responseLen: text.length, durationMs },
        'Gemini response received',
      );

      return { text, modelUsed: this.modelName, durationMs };
    } catch (error) {
      throw new RetrievalError(
        `Gemini chat completion failed: ${String(error)}`,
        { model: this.modelName },
      );
    }
  }
}
