/**
 * Abstraction over embedding generation.
 * MVP uses Gemini. Interface allows future local models (Ollama, etc).
 */
export interface EmbeddingProvider {
  /** Generate embeddings for a batch of texts. Returns one vector per input. */
  embed(texts: string[]): Promise<number[][]>;

  /** The model name being used */
  readonly modelName: string;
}
