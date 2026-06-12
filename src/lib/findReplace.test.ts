import { describe, expect, it } from 'vitest';
import { cycleMatchIndex, findMatchesInText } from './findReplace';

describe('findMatchesInText', () => {
  it('finds all occurrences with correct offsets', () => {
    expect(findMatchesInText('the cat and the hat', 'the', true)).toEqual([
      { start: 0, end: 3 },
      { start: 12, end: 15 },
    ]);
  });

  it('matches case-insensitively by default flag', () => {
    expect(findMatchesInText('The THE the', 'the', false)).toHaveLength(3);
    expect(findMatchesInText('The THE the', 'the', true)).toHaveLength(1);
  });

  it('treats the query as a literal string, not a regex', () => {
    expect(findMatchesInText('price is $5 (today)', '$5 (today)', true)).toEqual([
      { start: 9, end: 19 },
    ]);
    expect(findMatchesInText('a.c abc', 'a.c', true)).toEqual([{ start: 0, end: 3 }]);
  });

  it('returns no matches for empty inputs', () => {
    expect(findMatchesInText('', 'query', false)).toEqual([]);
    expect(findMatchesInText('text', '', false)).toEqual([]);
  });

  it('finds non-overlapping matches only', () => {
    expect(findMatchesInText('aaaa', 'aa', true)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });
});

describe('cycleMatchIndex', () => {
  it('wraps forward past the last index', () => {
    expect(cycleMatchIndex(3, 3)).toBe(0);
  });

  it('wraps backward past the first index', () => {
    expect(cycleMatchIndex(-1, 3)).toBe(2);
  });

  it('keeps in-range indexes unchanged', () => {
    expect(cycleMatchIndex(1, 3)).toBe(1);
  });

  it('returns zero when there are no matches', () => {
    expect(cycleMatchIndex(5, 0)).toBe(0);
  });
});
