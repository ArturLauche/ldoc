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
  const { blob } = await exportDocument({ html, name, locale, format: 'html' });
  await printFrame(blob);
}

/**
 * A `display: none` frame does not render in every engine, so the print
 * document stays in the page but zero-sized and out of sight. Engines that
 * return from `print()` while the dialog is still open (Safari opens it
 * asynchronously) keep the frame until it reports `afterprint`.
 */
async function printFrame(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');

  const removeFrame = () => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  const loaded = new Promise<void>((resolve, reject) => {
    frame.addEventListener('load', () => resolve(), { once: true });
    frame.addEventListener(
      'error',
      () => reject(new Error('The print document could not be displayed.')),
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
