import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { clearFontCaches } from '@/lib/export/fonts/registry';

/**
 * Serves the app's static assets to `fetch` like the dev server would:
 * `/fonts/*` from `public/` and bundled `/src/...` assets (fonts imported
 * with `?url`) from the repository. Everything else fails like a blocked
 * cross-origin request. Returns the URLs requested.
 */
export function serveExportAssets(): { requests: string[]; restore: () => void } {
  clearFontCaches();
  const requests: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    const path = new URL(url, 'http://localhost/').pathname;
    const file = path.startsWith('/fonts/') ? resolve('public', `.${path}`) : path.startsWith('/src/') ? resolve(`.${path}`) : null;
    if (!file || !existsSync(file) || !url.match(/^(?:\/|http:\/\/localhost\/)/)) {
      throw new TypeError('Failed to fetch');
    }
    const bytes = readFileSync(file);
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
    return new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': type } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    requests,
    restore: () => {
      vi.unstubAllGlobals();
      clearFontCaches();
    },
  };
}
