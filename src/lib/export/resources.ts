/**
 * Shared helpers for loading export resources: a byte-bounded LRU cache for
 * immutable same-origin assets (fonts), and a small concurrency limiter so a
 * document with many images never opens unbounded parallel requests.
 */

export class BoundedCache<T> {
  private readonly entries = new Map<string, { value: T; size: number }>();
  private total = 0;

  constructor(
    private readonly maxSize: number,
    private readonly sizeOf: (value: T) => number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    const size = this.sizeOf(value);
    if (size > this.maxSize) return;
    const existing = this.entries.get(key);
    if (existing) {
      this.total -= existing.size;
      this.entries.delete(key);
    }
    this.entries.set(key, { value, size });
    this.total += size;
    for (const [oldest, entry] of this.entries) {
      if (this.total <= this.maxSize) break;
      this.entries.delete(oldest);
      this.total -= entry.size;
    }
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }

  get size(): number {
    return this.total;
  }
}

/** Runs `task` over `items` with at most `limit` tasks in flight, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export const FONT_REQUEST_TIMEOUT_MS = 15_000;

/** Fetches and reads a same-origin asset; the timeout covers the body. Throws on failure. */
export async function fetchSameOrigin<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  timeoutMs = FONT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (typeof fetch !== 'function') throw new Error('fetch is unavailable');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
    return await read(response);
  } finally {
    clearTimeout(timeout);
  }
}
