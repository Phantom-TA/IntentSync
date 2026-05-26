import type { RepositoryProvider } from '@intentsync/repository-provider';
import type { FileEntry } from '@intentsync/core';
import type { Logger } from '@intentsync/logger';

/**
 * Extracts the current file tree from the repository at HEAD.
 */
export async function extractFileTree(
  provider: RepositoryProvider,
  log: Logger,
): Promise<FileEntry[]> {
  log.info('Extracting file tree');
  const tree = await provider.getFileTree();
  log.info({ count: tree.length }, 'File tree extracted');
  return tree;
}
