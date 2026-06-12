export interface TextMatch {
  /** Offset of the first matched character. */
  start: number;
  /** Offset just past the last matched character. */
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds non-overlapping occurrences of `query` inside `text`.
 *
 * Matching is done with a literal regex so case-insensitive mode never
 * shifts offsets the way `toLowerCase()` can for some Unicode characters.
 */
export function findMatchesInText(
  text: string,
  query: string,
  caseSensitive: boolean,
): TextMatch[] {
  if (!query || !text) return [];

  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? 'g' : 'gi');
  const matches: TextMatch[] = [];

  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    matches.push({ start: match.index, end: match.index + match[0].length });
  }

  return matches;
}

/** Wraps an index into `[0, total)`, used for next/previous match cycling. */
export function cycleMatchIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return ((index % total) + total) % total;
}
