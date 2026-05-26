import { Command } from 'commander';
import { printInfo, printHeader, printKeyValue } from '../utils/output.js';

export const inspectCommand = new Command('inspect')
  .description('Inspect repository entities (file, module, developer)');

inspectCommand
  .command('file <path>')
  .description('Show history and instability analysis for a file')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--local <repoPath>', 'Local repository path')
  .action((filePath: string, opts: { repo?: string; local?: string }) => {
    printHeader('File Intelligence');
    printKeyValue('File', filePath);
    printKeyValue('Repository', opts.repo ?? opts.local ?? '');
    printInfo('File instability scoring coming in Phase 5.');
  });

inspectCommand
  .command('module <dir>')
  .description('Show module-level intelligence for a directory')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--local <repoPath>', 'Local repository path')
  .action((dir: string, opts: { repo?: string; local?: string }) => {
    printHeader('Module Intelligence');
    printKeyValue('Module', dir);
    printKeyValue('Repository', opts.repo ?? opts.local ?? '');
    printInfo('Module intelligence coming in Phase 5.');
  });

inspectCommand
  .command('developer <login>')
  .description('Show developer contribution analysis')
  .option('--repo <owner/repo>', 'GitHub repository')
  .option('--local <repoPath>', 'Local repository path')
  .action((login: string, opts: { repo?: string; local?: string }) => {
    printHeader('Developer Intelligence');
    printKeyValue('Developer', login);
    printKeyValue('Repository', opts.repo ?? opts.local ?? '');
    printInfo('Developer ownership analysis coming in Phase 5.');
  });
