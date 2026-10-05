import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractExportDocumentFromHtml } from './model';
import { prepareExportImages, readJpegOrientation } from './images';
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
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { 'content-type': 'image/png', 'content-length': '1' },
        }),
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

it('preserves the size warning when stream cancellation rejects', async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
    },
    cancel() {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
  const warnings = new WarningCollector('docx');
  await prepareExportImages(
    documentWithImages('<img src="https://images.example/large.png">'),
    warnings,
  );
  expect(warnings.toArray()).toEqual([expect.objectContaining({ code: 'image-too-large' })]);
});

describe('HTML image embedding', () => {
  it('embeds remote originals for HTML and reports images it cannot embed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        url.includes('ok')
          ? Promise.resolve(new Response(PNG, { headers: { 'content-type': 'image/png' } }))
          : Promise.reject(new TypeError('Failed to fetch')),
      ),
    );
    const model = documentWithImages('<img src="https://images.example/ok.png" alt="Ok"><img src="https://images.example/blocked.png" alt="Blocked">');
    const warnings = new WarningCollector('html');
    await prepareExportImages(model, warnings, { mode: 'html' });
    const [ok, blocked] = model.blocks;
    expect(ok).toMatchObject({ type: 'image', original: { mimeType: 'image/png', bytes: PNG } });
    expect(blocked).not.toHaveProperty('original');
    expect(warnings.toArray()).toEqual([expect.objectContaining({ code: 'image-not-embedded', detail: 'Blocked' })]);
  });
});

describe('readJpegOrientation', () => {
  // SOI, APP1 "Exif" with a one-entry IFD holding Orientation (0x0112).
  const exif = (orientation: number, little: boolean) => {
    const u16 = (value: number) => (little ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff]);
    const u32 = (value: number) => (little ? [value & 0xff, (value >> 8) & 0xff, 0, 0] : [0, 0, (value >> 8) & 0xff, value & 0xff]);
    const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
    const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const length = payload.length + 2;
    return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...payload, 0xff, 0xda, 0, 2]);
  };

  it('reads the EXIF orientation in either byte order', () => {
    expect(readJpegOrientation(exif(6, true))).toBe(6);
    expect(readJpegOrientation(exif(3, false))).toBe(3);
  });

  it('defaults to upright for missing or invalid values', () => {
    expect(readJpegOrientation(exif(42, true))).toBe(1);
    expect(readJpegOrientation(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
  });
});
