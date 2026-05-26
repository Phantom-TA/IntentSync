import { existsSync } from 'fs';
import { dirname, join } from 'path';

/**
 * Walks up the directory tree from cwd, looking for a file with the given name.
 * Returns the full path if found, undefined otherwise.
 */
export function findUpSync(filename: string, cwd = process.cwd()): string | undefined {
  let dir = cwd;

  while (true) {
    const candidate = join(dir, filename);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return undefined; // reached filesystem root
    dir = parent;
  }
}
