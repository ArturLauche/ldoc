import { test, expect, type Page } from '@playwright/test';
import type { TiptapEditorHTMLElement } from '@tiptap/react';

const editor = (page: Page) => page.locator('.ProseMirror[contenteditable=true]');

async function ready(page: Page) {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(editor(page)).toBeVisible();
}

async function setContent(page: Page, html: string) {
  await editor(page).evaluate((element, value) => {
    const instance = (element as TiptapEditorHTMLElement).editor;
    if (!instance) throw new Error('The TipTap editor is not mounted');
    instance.commands.setContent(value);
  }, html);
}

/** Records print calls instead of opening a native dialog, in this page and in every frame it creates. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    const counts = window as unknown as { __framePrints: number; __pagePrints: number; __frameViews: Set<unknown> };
    counts.__framePrints = 0;
    counts.__pagePrints = 0;
    counts.__frameViews = new Set();
    window.print = () => counts.__pagePrints++;
    // The print command prints the exported document out of an iframe; record
    // `print` on that frame's window the moment the app first reads it.
    let proto: object | null = HTMLIFrameElement.prototype as unknown as object;
    let descriptor: PropertyDescriptor | undefined;
    while (proto && !descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(proto, 'contentWindow');
      proto = Object.getPrototypeOf(proto);
    }
    if (descriptor?.get) {
      const originalGet = descriptor.get;
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        ...descriptor,
        configurable: true,
        get() {
          const view = originalGet.call(this);
          if (view && !counts.__frameViews.has(view)) {
            counts.__frameViews.add(view);
            try {
              view.print = () => counts.__framePrints++;
            } catch {
              // Cross-origin frames cannot be stubbed; printing stays native.
            }
          }
          return view;
        },
      });
    }
  });
}

test.describe('printing', () => {
  test.beforeEach(async ({ page }) => {
    await stubPrint(page);
    await page.goto('/');
    await ready(page);
  });

  test('prints the export-styled document, not the editor page', async ({ page }) => {
    await setContent(page, '<h1>Headline for paper</h1><p>Body text of the printed document.</p>');
    const frameCounts = () =>
      page.evaluate(() => {
        const counts = window as unknown as { __framePrints: number; __pagePrints: number };
        return { frame: counts.__framePrints, page: counts.__pagePrints };
      });

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Print/ }).click();

    // The exported document is prepared and printed from its own frame; the
    // editor page itself is never printed.
    await expect.poll(async () => (await frameCounts()).frame).toBeGreaterThanOrEqual(1);
    expect((await frameCounts()).page).toBe(0);

    const printed = await page.evaluate(() => {
      // The print frame is tagged, so another embedded iframe could never match.
      const frame = document.querySelector('iframe[data-lwrite-print]') as HTMLIFrameElement | null;
      const doc = frame?.contentDocument;
      const css = doc?.querySelector('style')?.textContent ?? '';
      return {
        hidden: frame?.getAttribute('aria-hidden') ?? '',
        title: doc?.title ?? '',
        headline: doc?.querySelector('h1')?.textContent ?? '',
        column: Boolean(doc?.querySelector('.lwrite-document')),
        // The same paper and margins as the PDF export for the English interface.
        page: /@page\{size:letter;margin:1in\}/.test(css),
        fonts: doc?.fonts?.size ?? 0,
      };
    });
    expect(printed.hidden).toBe('true');
    expect(printed.title).toBe('Untitled Document');
    expect(printed.headline).toBe('Headline for paper');
    expect(printed.column).toBe(true);
    expect(printed.page).toBe(true);
    expect(printed.fonts).toBeGreaterThan(0);

    // Closing the print dialog removes the frame and releases its document.
    await page.evaluate(() => {
      const frame = document.querySelector('iframe[data-lwrite-print]') as HTMLIFrameElement | null;
      frame?.contentWindow?.dispatchEvent(new Event('afterprint'));
    });
    await expect(page.locator('iframe[data-lwrite-print]')).toHaveCount(0);
  });
});
