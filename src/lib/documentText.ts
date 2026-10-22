const BLOCKS = 'p,h1,h2,h3,li,tr,br,blockquote,pre,div';
const CACHE_LIMIT = 200;
const cache = new Map<string, string>();

/**
 * Visible text of stored document HTML, with block boundaries kept as
 * spaces (so search does not match markup or glue paragraphs together).
 * Results are cached per document revision, so reopening the library does
 * not parse every document again. Input is HTML from the library, which
 * was already sanitized when it was read; DOMParser documents are inert.
 */
export function documentPlainText(revisionKey: string, html: string): string {
  const cached = cache.get(revisionKey);
  if (cached !== undefined) {
    // Refresh recency for the bounded cache.
    cache.delete(revisionKey);
    cache.set(revisionKey, cached);
    return cached;
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  // textContent alone joins adjacent paragraphs/headings into one word.
  parsed.body.querySelectorAll(BLOCKS).forEach((block) => block.after(parsed.createTextNode(' ')));
  const text = (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  cache.set(revisionKey, text);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return text;
}
