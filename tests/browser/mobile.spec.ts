import { test, expect, type Page } from '@playwright/test';
import type { TiptapEditorHTMLElement } from '@tiptap/react';

const editor = (page: Page) => page.locator('.ProseMirror[contenteditable=true]');

async function ready(page: Page) {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(editor(page)).toBeVisible();
}

// TipTap publishes its editor on the ProseMirror root (`TiptapEditorHTMLElement`).
async function setContent(page: Page, html: string) {
  await editor(page).evaluate((element, value) => {
    const instance = (element as TiptapEditorHTMLElement).editor;
    if (!instance) throw new Error('The TipTap editor is not mounted');
    instance.commands.setContent(value);
  }, html);
}

async function selectText(page: Page, range: { from: number; to: number }) {
  await editor(page).evaluate((element, value) => {
    const instance = (element as TiptapEditorHTMLElement).editor;
    if (!instance) throw new Error('The TipTap editor is not mounted');
    instance.commands.setTextSelection(value);
  }, range);
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

async function expectInsideViewport(page: Page, selector: string) {
  const { width, height } = page.viewportSize()!;
  // Sheets and menus animate in; measure once they have settled.
  await expect
    .poll(() =>
      page.locator(selector).evaluateAll(
        (elements, viewport) =>
          elements.length > 0 &&
          elements.every((element) => {
            const box = element.getBoundingClientRect();
            return (
              box.left >= 0 &&
              box.top >= 0 &&
              box.right <= viewport.width &&
              box.bottom <= viewport.height
            );
          }),
        { width, height },
      ),
    )
    .toBe(true);
}

const longDocument = `<h1>Quarterly review</h1>${'<p>A paragraph of document text that wraps across several lines on a phone screen.</p>'.repeat(30)}<table><tr><th>Region</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Total</th></tr><tr><td>North</td><td>1</td><td>2</td><td>3</td><td>4</td><td>10</td></tr></table><p>Last line.</p>`;

test.describe('phone layout', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ready(page);
  });

  test('keeps the editor chrome compact without horizontal overflow', async ({ page }) => {
    const title = page.getByRole('textbox', { name: 'Document name', exact: true });
    await title.fill('A very long document name that cannot fit in a phone header at all');
    // Enter hands the keyboard back to the document.
    await title.press('Enter');
    await expect(editor(page)).toBeFocused();
    await setContent(page, longDocument);
    await expectNoHorizontalOverflow(page);

    const header = await page.locator('header').boundingBox();
    const toolbar = page.getByRole('group', { name: 'Document formatting' });
    const toolbarBox = await toolbar.boundingBox();
    expect(header!.height).toBeLessThanOrEqual(56);
    expect(toolbarBox!.height).toBeLessThanOrEqual(60);
    expect(toolbarBox!.y + toolbarBox!.height).toBeCloseTo(740, 0);
    // Wide tables scroll inside their own frame.
    expect(
      await page
        .locator('.tableWrapper')
        .evaluate((wrapper) => wrapper.scrollWidth > wrapper.clientWidth),
    ).toBe(true);

    // The header gets out of the way while reading down the document.
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect
      .poll(() =>
        page.locator('header').evaluate((element) => element.getBoundingClientRect().bottom),
      )
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 1000));
    await expect
      .poll(() =>
        page.locator('header').evaluate((element) => element.getBoundingClientRect().bottom),
      )
      .toBeGreaterThan(40);
  });

  test('formats from the toolbar and panels without losing editor focus', async ({ page }) => {
    await setContent(page, '<p>Hello world</p>');
    await editor(page).locator('p').tap();
    await selectText(page, { from: 1, to: 6 });

    await page.getByRole('button', { name: 'Bold', exact: true }).tap();
    await expect(editor(page).locator('strong')).toHaveText('Hello');
    await expect(editor(page)).toBeFocused();

    await page.getByRole('button', { name: 'Text formatting' }).tap();
    const panel = page.getByRole('region', { name: 'Formatting options' });
    await panel.getByRole('button', { name: 'Heading 1' }).tap();
    await expect(editor(page).locator('h1')).toContainText('Hello world');
    await panel.getByRole('tab', { name: 'Paragraph' }).tap();
    await panel.getByRole('button', { name: 'Align center' }).tap();
    await expect(editor(page).locator('h1')).toHaveAttribute('style', /text-align: center/);
    await expect(editor(page)).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });

  test('inserts from the panel and hands the keyboard back to the document', async ({ page }) => {
    await setContent(page, '<p>Hello</p>');
    await editor(page).locator('p').tap();

    await page.getByRole('button', { name: 'Insert', exact: true }).tap();
    const panel = page.getByRole('region', { name: 'Insert' });
    await panel.getByRole('button', { name: 'Insert table' }).tap();
    const cell = page.getByTestId('table-picker-cell-2-2');
    await cell.tap();
    await expect(editor(page).locator('table')).toHaveCount(0);
    await cell.tap();
    await expect(editor(page).locator('tr')).toHaveCount(2);
    await expect(panel).toBeHidden();
    await expect(editor(page)).toBeFocused();

    await selectText(page, { from: 1, to: 6 });
    await page.getByRole('button', { name: 'Insert', exact: true }).tap();
    await panel.getByRole('button', { name: 'Insert link' }).tap();
    await page.getByRole('textbox', { name: 'Enter URL...' }).fill('example.com');
    await page.getByRole('button', { name: 'Apply' }).tap();
    await expect(editor(page).locator('a[href="https://example.com/"]')).toHaveText('Hello');
    await expect(panel).toBeHidden();
    await expect(editor(page)).toBeFocused();
  });

  test('stays above a software keyboard', async ({ page }) => {
    await setContent(page, longDocument);
    await editor(page).locator('p').first().tap();
    await page.evaluate(() => {
      const viewport = window.visualViewport!;
      const height = window.innerHeight - 300;
      Object.defineProperty(viewport, 'height', { configurable: true, get: () => height });
      Object.defineProperty(viewport, 'offsetTop', { configurable: true, get: () => 0 });
      viewport.dispatchEvent(new Event('resize'));
    });
    const toolbar = page.getByRole('group', { name: 'Document formatting' });
    await expect
      .poll(async () => {
        const box = await toolbar.boundingBox();
        return Math.round(box!.y + box!.height);
      })
      .toBe(440);

    await page.getByRole('button', { name: 'File', exact: true }).tap();
    await page.getByRole('button', { name: 'Rename...' }).tap();
    const rename = page.getByRole('dialog', { name: 'Rename Document' });
    await expect(rename).toBeVisible();
    await expect
      .poll(async () => {
        const box = await rename.boundingBox();
        return Math.round(box!.y + box!.height);
      })
      .toBeLessThanOrEqual(440);
  });

  test('uses a file sheet and phone-sized overlays instead of nested menus', async ({ page }) => {
    await setContent(page, '<table><tr><td>Cell</td><td>Two</td></tr></table>');
    await page.getByRole('button', { name: 'File', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'File' });
    await expect(sheet).toBeVisible();
    await expectInsideViewport(page, '[role=dialog]');
    await expect(page.getByRole('menuitem')).toHaveCount(0);

    const download = page.waitForEvent('download');
    await sheet.getByRole('button', { name: 'Word Document (.docx)' }).tap();
    expect((await download).suggestedFilename()).toMatch(/\.docx$/);
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'File', exact: true }).tap();
    await page.getByRole('button', { name: 'Search Documents' }).tap();
    const library = page.getByRole('dialog', { name: 'Document Library' });
    await expect(library).toBeVisible();
    // A tap focuses the sheet itself, so no keyboard rises over the list.
    await expect(library).toBeFocused();
    await expect(
      library.getByRole('textbox', { name: 'Search saved documents' }),
    ).not.toBeFocused();
    await expectInsideViewport(page, '[role=dialog]');
    await page.keyboard.press('Escape');
    await expect(library).toBeHidden();

    await editor(page).locator('td').first().tap();
    await page.getByRole('button', { name: 'Table', exact: true }).tap();
    await expect(page.getByRole('menuitem', { name: 'Insert row below' })).toBeVisible();
    await expectInsideViewport(page, '[role=menu]');
    await page.getByRole('menuitem', { name: 'Insert row below' }).tap();
    await expect(editor(page).locator('tr')).toHaveCount(2);
  });
});

test.describe('narrow phone layout', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test('keeps the find field usable next to its controls', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await setContent(page, '<p>alpha beta alpha</p>');
    await page.getByRole('button', { name: 'Find & Replace' }).tap();
    const find = page.getByRole('textbox', { name: 'Find...' });
    await find.fill('alpha');
    await expect(page.getByText('1 of 2')).toBeVisible();
    const textWidth = await find.evaluate((input) => {
      const style = getComputedStyle(input);
      return (
        input.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight)
      );
    });
    expect(textWidth).toBeGreaterThanOrEqual(80);

    await page.getByRole('button', { name: 'Replace and match case' }).tap();
    await expect(page.getByRole('button', { name: 'Match case', exact: true })).toBeVisible();
    const replace = await page.getByRole('textbox', { name: 'Replace with...' }).boundingBox();
    expect(replace!.width).toBeGreaterThanOrEqual(100);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('landscape phone and desktop layouts', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');

  test('short landscape phones dock the compact toolbar', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('/');
    await ready(page);
    await expect(page.getByRole('group', { name: 'Document formatting' })).toHaveClass(
      /mobile-toolbar/,
    );
    expect((await page.locator('header').boundingBox())!.height).toBeLessThanOrEqual(56);
    await context.close();
  });

  test('desktop keeps the full single-row toolbar and file menu', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('/');
    await ready(page);
    await expect(page.locator('.mobile-toolbar')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Insert table' })).toBeVisible();
    expect((await page.locator('header').boundingBox())!.height).toBeLessThanOrEqual(110);

    await setContent(page, '<table><tr><td>Cell</td></tr></table>');
    await editor(page).locator('td').click();
    await expect(page.getByRole('button', { name: 'Cell fill' })).toBeVisible();
    // Contextual tools must not wrap the toolbar and push the document down.
    expect((await page.locator('header').boundingBox())!.height).toBeLessThanOrEqual(110);

    await page.getByRole('button', { name: 'File', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Export As' })).toBeVisible();
    await context.close();
  });
});
