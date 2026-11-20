import type { Locale } from '@/lib/translations';

export interface PrintDocumentOptions {
  html: string;
  name: string;
  locale: Locale;
}

/**
 * Prints the open document like the export options render it: the exported
 * HTML document (the shared typography, paper size and margins, embedded
 * fonts, images and Smart Graphic drawings) is loaded into a hidden frame
 * and printed, so the dialog shows the document instead of the editor's
 * screen surface.
 */
export async function printDocument({ html, name, locale }: PrintDocumentOptions): Promise<void> {
  const { exportDocument } = await import('./export/documentExport');
  const { blob, warnings } = await exportDocument({ html, name, locale, format: 'html' });
  // An image the export could not embed would print as a placeholder, while
  // the editor page still shows it: print that page instead (the caller
  // falls back), with the warning as the reason.
  const lossyImage = warnings.find((warning) => warning.code === 'image-not-embedded');
  if (lossyImage) throw new Error(lossyImage.message);
  await printFrame(blob);
}

/** Blob documents carry no network load; this only guards against a stalled engine. */
const FRAME_LOAD_TIMEOUT_MS = 20_000;

/**
 * A `display: none` frame does not render in every engine, so the print
 * document stays in the page but zero-sized and out of sight. Engines that
 * return from `print()` while the dialog is still open (Safari opens it
 * asynchronously) keep the frame until it reports `afterprint`; if an engine
 * never reports it, the next print replaces the leftover frame, and the guard
 * in the menu covers the gap.
 */
async function printFrame(blob: Blob): Promise<void> {
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
    view.addEventListener('afterprint', removeFrame, { once: true });
    view.focus();
    view.print();
  } catch (error) {
    removeFrame();
    throw error;
  }
}
