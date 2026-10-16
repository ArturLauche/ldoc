import { describe, expect, it } from 'vitest';
import { countCharacters, countWords } from './textStats';

describe('text statistics', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('Two words')).toBe(2);
    expect(countWords('  spaced\n\nout   text ')).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('segments scripts written without spaces', () => {
    // 3 words: 我 / 喜欢 / 编辑器 (segmenters may split differently, never as one).
    expect(countWords('我喜欢编辑器', 'zh')).toBeGreaterThan(1);
    expect(countWords('これは日本語の文章です。', 'ja')).toBeGreaterThan(3);
    // Punctuation is not a word.
    expect(countWords('你好。', 'zh')).toBe(1);
  });

  it('counts astral characters once', () => {
    expect(countCharacters('a😀b')).toBe(3);
    expect(countCharacters('')).toBe(0);
  });
});
