/**
 * Word and character counts for any of the interface languages. Scripts
 * written without spaces (Chinese, Japanese, Thai, ...) are segmented with
 * `Intl.Segmenter`; other text keeps the fast whitespace count.
 */

// Han, Hiragana, Katakana, Hangul, Thai, Lao, Khmer, Myanmar.
const UNSPACED_SCRIPT =
  /[฀-໿က-႟ក-៿぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;

const segmenters = new Map<string, Intl.Segmenter>();

function wordSegmenter(locale: string): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  let segmenter = segmenters.get(locale);
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    segmenters.set(locale, segmenter);
  }
  return segmenter;
}

export function countWords(text: string, locale = 'en'): number {
  const segmenter = UNSPACED_SCRIPT.test(text) ? wordSegmenter(locale) : null;
  if (!segmenter) return text.match(/\S+/g)?.length ?? 0;
  let count = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) count += 1;
  }
  return count;
}

/** Characters as code points, so an emoji or other astral symbol counts once. */
export function countCharacters(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char) count += 1;
  }
  return count;
}
