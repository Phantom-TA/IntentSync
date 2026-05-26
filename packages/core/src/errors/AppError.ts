export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class IngestionError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('INGESTION_ERROR', message, context);
  }
}

export class ProviderError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('PROVIDER_ERROR', message, context);
  }
}

export class EmbeddingError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('EMBEDDING_ERROR', message, context);
  }
}

export class RetrievalError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('RETRIEVAL_ERROR', message, context);
  }
}

export class GraphError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('GRAPH_ERROR', message, context);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFIG_ERROR', message, context);
  }
}
