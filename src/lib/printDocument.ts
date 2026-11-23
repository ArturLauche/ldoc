import type { Locale } from '@/lib/translations';
import { PX_TO_PT, pageGeometry } from './export/typography';

export interface PrintDocumentOptions {
  html: string;
  name: string;
  locale: Locale;
}

/** Blob documents carry no network load; this only guards against a stalled engine. */
const FRAME_LOAD_TIMEOUT_MS = 20_000;

/**
 * Content the printed page would lose is not silently printed: an image the
 * export could not embed or a Smart Graphic that could not be drawn would
 * come out degraded, while the editor page still shows it, so the caller
 * falls back to printing that page, with the warning as the reason.
 */
const LOSSY_WARNING_CODES = new Set(['image-not-embedded', 'graphic-layout-simplified']);

/**
 * Prints the open document like the export options render it: the exported
 * HTML document — laid out for the locale's paper (the same geometry as the
 * PDF export) with the shared typography, embedded fonts, images and Smart
 * Graphic drawings — loads into a hidden frame, and printing that frame
 * reproduces the PDF export's pages instead of the editor's screen surface.
 */
export async function printDocument({ html, name, locale }: PrintDocumentOptions): Promise<void> {
  const { exportDocument } = await import('./export/documentExport');
  const { blob, warnings } = await exportDocument({ html, name, locale, format: 'html', paper: true });
  const lossy = warnings.find((warning) => LOSSY_WARNING_CODES.has(warning.code));
  if (lossy) throw new Error(lossy.message);
  await printFrame(blob, locale);
}

/**
 * A `display: none` frame does not render in every engine, so the print
 * document stays in the page but zero-sized and out of sight. Engines that
 * return from `print()` while the dialog is still open (Safari opens it
 * asynchronously) keep the frame until it reports `afterprint`; if an engine
 * never reports it, the next print replaces the leftover frame, and the guard
 * in the menu covers the gap.
 */
async function printFrame(blob: Blob, locale: Locale): Promise<void> {
  const geometry = pageGeometry(locale);
  const url = URL.createObjectURL(blob);
  // Supersede a frame an earlier print left behind (no `afterprint` came).
  document.querySelectorAll('iframe[data-lwrite-print]').forEach((stale) => {
    stale.remove();
    const staleUrl = stale.getAttribute('data-lwrite-print');
    if (staleUrl) URL.revokeObjectURL(staleUrl);
  });

  const frame = document.createElement('iframe');
  frame.setAttribute('data-lwrite-print', url);
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');

  // Printing moves focus into the frame; put the caret back afterwards.
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const removeFrame = () => {
    frame.remove();
    URL.revokeObjectURL(url);
    if (previouslyFocused?.isConnected && document.activeElement !== previouslyFocused) {
      previouslyFocused.focus();
    }
  };
  const loaded = new Promise<void>((resolve, reject) => {
    // Most load failures do not fire the frame's `error` event; the deadline
    // keeps the flow from hanging (and the menu disabled forever).
    const timeout = setTimeout(() => reject(new Error('The print document could not be displayed.')), FRAME_LOAD_TIMEOUT_MS);
    const settle = (finish: () => void) => () => {
      clearTimeout(timeout);
      finish();
    };
    frame.addEventListener('load', settle(resolve), { once: true });
    frame.addEventListener(
      'error',
      settle(() => reject(new Error('The print document could not be displayed.'))),
      { once: true },
    );
  });

  frame.src = url;
  document.body.appendChild(frame);

  try {
    await loaded;
    const view = frame.contentWindow;
    if (!view) throw new Error('The print document could not be displayed.');
    // Embedded fonts (data URLs) ship inside the loaded document; `fonts.ready`
    // awaits their decode so the dialog renders the first page completely.
    await view.document.fonts?.ready;
    // Images arrive as data URLs, but decoding them is asynchronous too; the
    // printed page needs the pixels ready before the dialog renders it.
    await Promise.all(
      Array.from(view.document.images).map((image) =>
        typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve(),
      ),
    );
    markOversizedRows(view, geometry.contentWidthPx, geometry.contentHeightPt / PX_TO_PT);
    view.addEventListener('afterprint', removeFrame, { once: true });
    view.focus();
    view.print();
  } catch (error) {
    removeFrame();
    throw error;
  }
}

/**
 * `break-inside: avoid` protects rows from being cut at a page edge, but a
 * row taller than the page would be pushed to a fresh (mostly empty) page and
 * then cut anyway. Rows that tall are marked instead, and the print
 * stylesheet lets them fragment; the PDF export splits them the same way.
 * Heights are measured in the print geometry (the page's content width), so
 * the probe styles the frame like the print media does while it measures.
 */
function markOversizedRows(view: Window, contentWidthPx: number, contentHeightPx: number): void {
  const doc = view.document;
  const body = doc.body;
  const frame = view.frameElement;
  if (!body || !(frame instanceof HTMLElement)) return;
  const previousWidth = frame.style.width;
  const probe = doc.createElement('style');
  probe.textContent = '.lwrite-document{max-width:none!important;padding:0!important}';
  try {
    frame.style.width = `${Math.round(contentWidthPx)}px`;
    doc.head?.appendChild(probe);
    Array.from(doc.querySelectorAll<HTMLElement>('tr')).forEach((row) => {
      if (row.getBoundingClientRect().height > contentHeightPx - 1) {
        row.setAttribute('data-lwrite-breakable', '');
      }
    });
  } finally {
    probe.remove();
    frame.style.width = previousWidth;
  }
}
