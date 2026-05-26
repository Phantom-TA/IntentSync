import { z } from 'zod';

export const configSchema = z.object({
  // PostgreSQL
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // ChromaDB
  CHROMA_HOST: z.string().url().default('http://localhost:8000'),
  CHROMA_COLLECTION_PREFIX: z.string().default('intentsync'),

  // Neo4j — optional until Phase 6
  NEO4J_URI: z.string().optional(),
  NEO4J_USER: z.string().optional(),
  NEO4J_PASSWORD: z.string().optional(),

  // GitHub
  GITHUB_TOKEN: z.string().optional(),

  // Gemini
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),

  // App
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
});

export type AppConfig = z.infer<typeof configSchema>;
