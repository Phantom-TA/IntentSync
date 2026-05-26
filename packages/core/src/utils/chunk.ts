export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

/**
 * Splits text into overlapping chunks.
 * Token approximation: 1 token ≈ 4 characters.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const { maxTokens = 512, overlapTokens = 50 } = options;
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + maxChars, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end === trimmed.length) break;
    start += maxChars - overlapChars;
  }

  return chunks;
}
