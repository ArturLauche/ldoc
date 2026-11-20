import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printDocument } from './printDocument';

const exportDocument = vi.hoisted(() => vi.fn());
vi.mock('@/lib/export/documentExport', () => ({ exportDocument }));

const createObjectURL = vi.hoisted(() => vi.fn());
const revokeObjectURL = vi.hoisted(() => vi.fn());

beforeEach(() => {
  exportDocument.mockReset();
  let urls = 0;
  createObjectURL.mockReset().mockImplementation(() => `blob:print-${(urls += 1)}`);
  revokeObjectURL.mockReset();
  // jsdom ships no Blob URL support; the real function is absent here.
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
});

afterEach(() => {
  document.body.replaceChildren();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.useRealTimers();
});

/** The print frame once `printDocument` has mounted it. */
async function printFrame(): Promise<HTMLIFrameElement> {
  return vi.waitFor(() => {
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('The print frame is not mounted yet.');
    return frame as HTMLIFrameElement;
  });
}

function stubDialog(frame: HTMLIFrameElement): { print: ReturnType<typeof vi.fn>; view: Window } {
  const view = frame.contentWindow as Window;
  const print = vi.fn();
  view.print = print;
  view.focus = vi.fn();
  return { print, view };
}

function exportBlob(html = '<html></html>') {
  return {
    blob: new Blob([html], { type: 'text/html' }),
    fileName: 'printed-doc.html',
    warnings: [],
  };
}

describe('printDocument', () => {
  it('prints the exported HTML document from a hidden frame and cleans it up afterwards', async () => {
    exportDocument.mockResolvedValue(exportBlob());

    const printing = printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' });
    const frame = await printFrame();
    expect(exportDocument).toHaveBeenCalledWith({
      html: '<p>Print me</p>',
      name: 'Printed doc',
      locale: 'en',
      format: 'html',
    });
    expect(frame.src).toBe('blob:print-1');
    expect(frame.getAttribute('aria-hidden')).toBe('true');

    const { print, view } = stubDialog(frame);
    frame.dispatchEvent(new Event('load'));
    await printing;
    expect(print).toHaveBeenCalledTimes(1);

    // The frame stays until the dialog reports that printing finished.
    expect(document.querySelector('iframe')).toBe(frame);
    view.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-1');
  });

  it('rejects without a frame when the export document cannot be built', async () => {
    exportDocument.mockRejectedValue(new Error('This document is too large to export.'));

    await expect(
      printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' }),
    ).rejects.toThrow('This document is too large to export.');
    expect(document.querySelector('iframe')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects when the export lost content the editor page still shows', async () => {
    // A remote image the export could not embed prints as a placeholder; the
    // caller falls back to the editor page, which shows the actual image.
    exportDocument.mockResolvedValue({
      ...exportBlob(),
      warnings: [
        {
          code: 'image-not-embedded',
          format: 'html',
          message: 'A remote image could not be embedded and was replaced with its alt text.',
        },
      ],
    });

    await expect(
      printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' }),
    ).rejects.toThrow('A remote image could not be embedded and was replaced with its alt text.');
    expect(document.querySelector('iframe')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects and cleans up when the print document fails to load', async () => {
    exportDocument.mockResolvedValue(exportBlob());

    const printing = printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' });
    const frame = await printFrame();
    frame.dispatchEvent(new Event('error'));

    await expect(printing).rejects.toThrow('The print document could not be displayed.');
    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-1');
  });

  it('stops waiting for a frame whose load event never comes', async () => {
    vi.useFakeTimers();
    exportDocument.mockResolvedValue(exportBlob());

    const printing = printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' });
    // Attach the handler before the deadline fires, as the caller (the menu)
    // already owns the whole flow when the timeout rejects.
    const rejection = expect(printing).rejects.toThrow('The print document could not be displayed.');
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('iframe')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(20_001);
    await rejection;
    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-1');
  });

  it('replaces the frame of an earlier print whose dialog never reported back', async () => {
    exportDocument.mockResolvedValue(exportBlob());

    // First print: dialog open, no `afterprint` yet.
    const firstPrint = printDocument({ html: '<p>First</p>', name: 'Printed doc', locale: 'en' });
    const first = await printFrame();
    stubDialog(first);
    first.dispatchEvent(new Event('load'));
    await firstPrint;
    expect(document.querySelectorAll('iframe')).toHaveLength(1);

    // A second print supersedes it and releases its document. Wait for the new
    // frame by its own URL: the old one sits in the DOM until the swap.
    const secondPrint = printDocument({ html: '<p>Second</p>', name: 'Printed doc', locale: 'en' });
    const second = await vi.waitFor(() => {
      const frame = document.querySelector('iframe[data-lwrite-print="blob:print-2"]');
      if (!frame) throw new Error('The replacement frame is not mounted yet.');
      return frame as HTMLIFrameElement;
    });
    expect(second).not.toBe(first);
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-1');

    stubDialog(second);
    second.dispatchEvent(new Event('load'));
    await secondPrint;
    second.contentWindow?.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-2');
  });

  it('returns focus to the document after the frame is cleaned up', async () => {
    exportDocument.mockResolvedValue(exportBlob());
    // Like the editor surface: a focusable editing host.
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const other = document.createElement('button');
    document.body.append(editor, other);
    editor.focus();
    expect(document.activeElement).toBe(editor);

    const printing = printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' });
    const frame = await printFrame();
    const { view } = stubDialog(frame);
    frame.dispatchEvent(new Event('load'));
    await printing;
    // The dialog took the caret from the editor (focus moved elsewhere).
    other.focus();
    expect(document.activeElement).toBe(other);

    view.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
    // The caret is back on the document that was focused for printing.
    expect(document.activeElement).toBe(editor);
  });});
