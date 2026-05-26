import type { Logger } from '@intentsync/logger';
import { ProviderError } from '@intentsync/core';
import { GitHubProvider } from './github.provider.js';
import { LocalGitProvider } from './local-git.provider.js';
import type { RepositoryProvider } from './provider.interface.js';

export interface GitHubProviderConfig {
  type: 'github';
  owner: string;
  repo: string;
  token: string;
  clonePath?: string;
}

export interface LocalGitProviderConfig {
  type: 'local';
  repoPath: string;
}

export type ProviderConfig = GitHubProviderConfig | LocalGitProviderConfig;

/**
 * Creates the appropriate RepositoryProvider based on config.
 * All ingestion code calls this factory — never instantiates providers directly.
 */
export function createProvider(
  config: ProviderConfig,
  logger: Logger,
): RepositoryProvider {
  if (config.type === 'github') {
    if (!config.token) {
      throw new ProviderError(
        'GITHUB_TOKEN is required for GitHub repositories.',
      );
    }
    return new GitHubProvider({
      owner: config.owner,
      repo: config.repo,
      token: config.token,
      logger,
      clonePath: config.clonePath,
    });
  }

  if (config.type === 'local') {
    return new LocalGitProvider({ repoPath: config.repoPath, logger });
  }

  throw new ProviderError('Unknown provider type');
}
