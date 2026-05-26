import { createHash } from 'crypto';

/**
 * Generates a stable 16-char hex ID from the given parts.
 * Deterministic — same inputs always produce the same output.
 */
export function stableId(...parts: string[]): string {
  return createHash('sha256')
    .update(parts.join('::'))
    .digest('hex')
    .slice(0, 16);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
