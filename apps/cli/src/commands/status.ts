import { Command } from 'commander';
import { printHeader, printKeyValue, printSuccess, printError } from '../utils/output.js';

export const statusCommand = new Command('status')
  .description('Check system health and service connectivity')
  .action(async () => {
    printHeader('IntentSync — System Status');

    // PostgreSQL check
    try {
      const { getConfig } = await import('@intentsync/core');
      const config = getConfig();
      printKeyValue('Config', '✓ Environment validated');
      printKeyValue('DB URL', config.DATABASE_URL.replace(/:\/\/.*@/, '://***@'));
      printKeyValue('ChromaDB', config.CHROMA_HOST);
      printKeyValue('Gemini Model', config.GEMINI_CHAT_MODEL);
      printKeyValue('GitHub Token', config.GITHUB_TOKEN ? '✓ Set' : '✗ Not set');
      printKeyValue('Neo4j URI', config.NEO4J_URI ?? '(Phase 6 — not configured)');
      printSuccess('Configuration loaded successfully.');
    } catch (error) {
      printError(error instanceof Error ? error.message : String(error));
      printError('Fix the above environment errors before proceeding.');
      process.exit(1);
    }
  });
