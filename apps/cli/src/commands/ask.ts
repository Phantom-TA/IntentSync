import { Command } from 'commander';
import { printInfo, printHeader, printKeyValue } from '../utils/output.js';

export const askCommand = new Command('ask')
  .description('Ask a natural language question about a repository')
  .argument('<question>', 'Your question about the repository')
  .option('--repo <owner/repo>', 'GitHub repository to query')
  .option('--local <path>', 'Local repository path to query')
  .option('--format <format>', 'Output format: text or json', 'text')
  .option('--depth <number>', 'Number of context chunks to retrieve', '10')
  .action(
    (
      question: string,
      opts: { repo?: string; local?: string; format: string; depth: string },
    ) => {
      if (!opts.repo && !opts.local) {
        console.error('Provide either --repo <owner/repo> or --local <path>');
        process.exit(1);
      }

      printHeader('IntentSync — Repository Query');
      printKeyValue('Question', question);
      printKeyValue('Repository', opts.repo ?? opts.local ?? '');
      printKeyValue('Format', opts.format);
      printKeyValue('Depth', opts.depth);
      printInfo('');
      printInfo('Retrieval engine + AI query coming in Phase 4.');
      printInfo('This is the primary product command.');
      printInfo('Target answer: historically-grounded repository intelligence.');
    },
  );
