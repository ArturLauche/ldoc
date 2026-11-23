import { test, expect, type Page } from '@playwright/test';
import type { TiptapEditorHTMLElement } from '@tiptap/react';
import { stubPrint } from './print-fidelity';

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

/** The counters the print stub keeps, before printing and after. */
const printCounts = (page: Page) =>
  page.evaluate(() => {
    const probe = (window as unknown as { __lwriteProbe?: { framePrints: number; pagePrints: number } }).__lwriteProbe;
    return { frame: probe?.framePrints ?? 0, page: probe?.pagePrints ?? 0 };
  });

async function releaseFrame(page: Page) {
  await page.evaluate(() => {
    const frame = document.querySelector('iframe[data-lwrite-print]') as HTMLIFrameElement | null;
    frame?.contentWindow?.dispatchEvent(new Event('afterprint'));
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

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Print/ }).click();

    // The exported document is prepared and printed from its own frame; the
    // editor page itself is never printed.
    await expect.poll(async () => (await printCounts(page)).frame).toBeGreaterThanOrEqual(1);
    expect((await printCounts(page)).page).toBe(0);

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
        page: /@page\{size:612pt 792pt;margin:72pt\}/.test(css),
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
    await releaseFrame(page);
    await expect(page.locator('iframe[data-lwrite-print]')).toHaveCount(0);
  });

  test('prepares pagination like the PDF export: repeated headers and fragmenting tall rows', async ({ page }) => {
    const table = `<table><tbody><tr><th><p>Head A</p></th><th><p>Head B</p></th></tr>${Array.from(
      { length: 60 },
      (_, index) => `<tr><td><p>Row ${index + 1}</p></td><td><p>Cell ${index + 1}</p></td></tr>`,
    ).join('')}</tbody></table>`;
    const tallRow = `<tr><td><p>${Array.from({ length: 240 }, () => 'Tall cell line ').join('')}</p></td><td><p>Side</p></td></tr>`;
    // The tall row joins the table: a stranded <tr> parses nowhere.
    await setContent(page, `<h2>Structure</h2>${table.slice(0, -'</table>'.length)}${tallRow}</table><p>After the tall row.</p>`);

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Print/ }).click();
    await expect.poll(async () => (await printCounts(page)).frame).toBeGreaterThanOrEqual(1);

    const prepared = await page.evaluate(() => {
      const frame = document.querySelector('iframe[data-lwrite-print]') as HTMLIFrameElement | null;
      const doc = frame?.contentDocument;
      const css = doc?.querySelector('style')?.textContent ?? '';
      const tall = Array.from(doc?.querySelectorAll('tr') ?? []).find((row) => (row.textContent ?? '').includes('Tall cell'));
      return {
        // A table that continues on another page repeats its header rows: the
        // leading header row sits in a thead, exactly the rows the PDF export repeats.
        header: doc?.querySelector('table thead th')?.textContent ?? '',
        bodyRows: doc?.querySelectorAll('table tbody tr').length ?? 0,
        // A row taller than the page is allowed to fragment instead of being
        // pushed to an empty page and clipped: the preparation measured it at
        // the paper's width and marked it.
        breakable: tall?.getAttribute('data-lwrite-breakable') ?? 'missing',
        cell: tall?.querySelector('td')?.textContent ?? '',
        // The screen responsive rules can never kick in while printing, and
        // paragraphs keep at least two lines on either side of a break.
        screenScoped: css.includes('@media screen and (max-width:639px)'),
        bareRange: /@media \(max-width/.test(css),
        orphans: css.includes('p,li,pre{orphans:2;widows:2}'),
        avoidRules: css.includes('break-inside:avoid}'),
      };
    });
    expect(prepared.header).toBe('Head A');
    expect(prepared.bodyRows).toBe(61);
    expect(prepared.breakable).toBe('');
    expect(prepared.cell).toContain('Tall cell line');
    expect(prepared.screenScoped).toBe(true);
    expect(prepared.bareRange).toBe(false);
    expect(prepared.orphans).toBe(true);
    expect(prepared.avoidRules).toBe(true);
    // The fallback prints the page itself, never a degraded document.
    await releaseFrame(page);
  });

  test('falls back to printing the editor page when the print document cannot be built', async ({ page }) => {
    await setContent(page, '<h1>Page print fallback</h1><p>An image the export cannot embed.</p>');
    // A print without network-loaded images can embed everything; force the
    // lossy path the way a blocked remote image would.

    // Set content with an image that cannot be embedded (remote), then print:
    // the app reports the fallback and prints the page instead.
    await setContent(page, '<p>Fallback with image</p><img src="https://missing.example/pixel.png" alt="Missing">');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Print/ }).click();
    // The export could not embed the image, so the menu prints the page.
    await expect.poll(async () => (await printCounts(page)).page).toBeGreaterThanOrEqual(1);
    expect((await printCounts(page)).frame).toBe(0);
    await expect(page.locator('iframe[data-lwrite-print]')).toHaveCount(0);
  });
});
