import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printDocument } from './printDocument';

const exportDocument = vi.hoisted(() => vi.fn());
vi.mock('@/lib/export/documentExport', () => ({ exportDocument }));

const createObjectURL = vi.hoisted(() => vi.fn());
const revokeObjectURL = vi.hoisted(() => vi.fn());

beforeEach(() => {
  exportDocument.mockReset();
  createObjectURL.mockReset().mockReturnValue('blob:print-document');
  revokeObjectURL.mockReset();
  // jsdom ships no Blob URL support; the real function is absent here.
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
});

afterEach(() => {
  document.body.replaceChildren();
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
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

describe('printDocument', () => {
  it('prints the exported HTML document from a hidden frame and cleans it up afterwards', async () => {
    exportDocument.mockResolvedValue({
      blob: new Blob(['<!doctype html><title>Printed doc</title>'], { type: 'text/html' }),
      fileName: 'printed-doc.html',
      warnings: [],
    });

    const printing = printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' });
    const frame = await printFrame();
    expect(exportDocument).toHaveBeenCalledWith({
      html: '<p>Print me</p>',
      name: 'Printed doc',
      locale: 'en',
      format: 'html',
    });
    expect(frame.src).toBe('blob:print-document');
    expect(frame.getAttribute('aria-hidden')).toBe('true');

    const { print, view } = stubDialog(frame);
    frame.dispatchEvent(new Event('load'));
    await printing;
    expect(print).toHaveBeenCalledTimes(1);

    // The frame stays until the dialog reports that printing finished.
    expect(document.querySelector('iframe')).toBe(frame);
    view.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-document');
  });

  it('rejects without a frame when the export document cannot be built', async () => {
    exportDocument.mockRejectedValue(new Error('This document is too large to export.'));

    await expect(
      printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' }),
    ).rejects.toThrow('This document is too large to export.');
    expect(document.querySelector('iframe')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects and cleans up when the print document fails to load', async () => {
    exportDocument.mockResolvedValue({
      blob: new Blob(['<html></html>'], { type: 'text/html' }),
      fileName: 'printed-doc.html',
      warnings: [],
    });

    const printing = printDocument({ html: '<p>Print me</p>', name: 'Printed doc', locale: 'en' });
    const frame = await printFrame();
    frame.dispatchEvent(new Event('error'));

    await expect(printing).rejects.toThrow('The print document could not be displayed.');
    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-document');
  });
});
