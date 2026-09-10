import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractExportDocumentFromHtml } from './model';
import { prepareExportImages } from './images';
import { WarningCollector } from './warnings';

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  ),
  (char) => char.charCodeAt(0),
);
function documentWithImages(html: string) {
  return extractExportDocumentFromHtml({ html, name: 'Images', locale: 'en' });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('export image preparation', () => {
  it('downloads duplicate sources once per export and preserves both image blocks', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(PNG, { headers: { 'content-type': 'image/png' } })),
      );
    vi.stubGlobal('fetch', fetch);
    const model = documentWithImages(
      '<img src="https://images.example/logo.png" alt="First"><img src="https://images.example/logo.png" alt="Second">',
    );
    const warnings = new WarningCollector('docx');
    await prepareExportImages(model, warnings);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(model.blocks).toEqual([
      expect.objectContaining({
        type: 'image',
        alt: 'First',
        prepared: expect.objectContaining({ width: 1, height: 1, bytes: PNG }),
      }),
      expect.objectContaining({
        type: 'image',
        alt: 'Second',
        prepared: expect.objectContaining({ width: 1, height: 1, bytes: PNG }),
      }),
    ]);
    expect(warnings.toArray()).toEqual([]);
    await prepareExportImages(model, warnings);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops a streamed image above the size limit without trusting Content-Length', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { 'content-type': 'image/png', 'content-length': '1' } }),
        ),
    );
    const warnings = new WarningCollector('odt');
    await prepareExportImages(
      documentWithImages('<img src="https://images.example/large.png" alt="Large">'),
      warnings,
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(warnings.toArray()).toEqual([expect.objectContaining({ code: 'image-too-large' })]);
  });

  it('aborts an unresponsive server so export can finish with an explicit warning', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('Timed out', 'AbortError')),
            );
          }),
      ),
    );
    const warnings = new WarningCollector('pdf');
    const pending = prepareExportImages(
      documentWithImages('<img src="https://images.example/slow.png" alt="Slow">'),
      warnings,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    expect(warnings.toArray()).toEqual([expect.objectContaining({ code: 'image-fetch-failed' })]);
  });

  it('rejects zero-dimension image headers rather than passing invalid geometry to exporters', async () => {
    const bytes = new Uint8Array(PNG);
    bytes.fill(0, 16, 24);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } })),
    );
    const warnings = new WarningCollector('docx');
    await prepareExportImages(
      documentWithImages('<img src="https://images.example/broken.png">'),
      warnings,
    );
    expect(warnings.toArray()).toEqual([expect.objectContaining({ code: 'image-decode-failed' })]);
  });
});
