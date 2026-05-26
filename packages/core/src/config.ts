import { config as dotenvConfig } from 'dotenv';
import { findUpSync } from './utils/find-up.js';
import { configSchema, type AppConfig } from './schemas/config.schema.js';
import { ConfigError } from './errors/AppError.js';

// Load .env from the nearest ancestor directory that has one
const envPath = findUpSync('.env');
if (envPath) dotenvConfig({ path: envPath });

let _config: AppConfig | null = null;

/**
 * Returns the validated application config.
 * Validated once on first call; cached thereafter.
 * Throws ConfigError if any required env vars are missing.
 */
export function getConfig(): AppConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new ConfigError(
      `Invalid environment configuration:\n${issues}`,
      { issues: result.error.issues },
    );
  }

  _config = result.data;
  return _config;
}
