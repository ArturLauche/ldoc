import { test, expect, type Page } from '@playwright/test';
import type { TiptapEditorHTMLElement } from '@tiptap/react';

const editor = (page: Page) => page.locator('.ProseMirror[contenteditable=true]');
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Document formatting' });
const popovers = (page: Page) => page.getByRole('dialog');

async function ready(page: Page) {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(editor(page)).toBeVisible();
  await expect(toolbar(page)).toBeVisible();
}

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

async function headerHeight(page: Page) {
  return (await page.locator('header').boundingBox())!.height;
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

async function expectToolbarFits(page: Page) {
  const fit = await toolbar(page).evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
    height: element.getBoundingClientRect().height,
  }));
  expect(fit.scroll).toBeLessThanOrEqual(fit.client);
  expect(fit.height).toBeLessThanOrEqual(48);
}

test.describe('desktop toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ready(page);
  });

  test('keeps one stable row from small desktop widths to wide screens', async ({ page }) => {
    let baseline: number | undefined;
    for (const width of [640, 768, 1024, 1200, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      if (width < 1024) {
        await expect(page.getByRole('button', { name: 'Insert', exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'Insert table' })).toBeVisible();
      }
      if (width < 1280) {
        await expect(page.getByRole('button', { name: 'More formatting' })).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'Select font' })).toBeVisible();
      }
      const height = await headerHeight(page);
      baseline ??= height;
      expect(height).toBe(baseline);
      expect(height).toBeLessThanOrEqual(110);
      await expectToolbarFits(page);
      await expectNoPageOverflow(page);
    }
  });

  test('inserts from a popover without moving the document or losing focus', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await setContent(page, '<p>Hello world</p>');
    await selectText(page, { from: 1, to: 6 });
    const beforeHeader = await headerHeight(page);
    const beforeEditorY = (await editor(page).boundingBox())!.y;

    const insert = page.getByRole('button', { name: 'Insert', exact: true });
    await insert.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await insert.click();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const panel = popovers(page).first();
    await expect(panel).toBeVisible();
    expect(await headerHeight(page)).toBe(beforeHeader);
    expect((await editor(page).boundingBox())!.y).toBe(beforeEditorY);

    await panel.getByRole('button', { name: 'Insert table' }).click();
    await page.getByTestId('table-picker-cell-2-2').click();
    await expect(editor(page).locator('tr')).toHaveCount(2);
    await expect(panel).toBeHidden();
    await expect(editor(page)).toBeFocused();

    await setContent(page, '<p>Hello world</p>');
    await selectText(page, { from: 1, to: 6 });
    await insert.click();
    await panel.getByRole('button', { name: 'Insert link' }).click();
    await page.getByRole('textbox', { name: 'Insert link' }).fill('example.com');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(editor(page).locator('a[href="https://example.com/"]')).toHaveText('Hello');
    await expect(panel).toBeHidden();
    await expect(editor(page)).toBeFocused();
    await expectNoPageOverflow(page);
  });

  test('applies popover formatting, layers nested pickers, and roves with arrows', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await setContent(page, '<p>Hello world</p>');
    await selectText(page, { from: 1, to: 6 });
    const beforeHeader = await headerHeight(page);

    const more = page.getByRole('button', { name: 'More formatting' });
    await more.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await more.click();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    const panel = popovers(page).first();
    await expect(panel).toBeVisible();
    expect(await headerHeight(page)).toBe(beforeHeader);

    await panel.getByRole('button', { name: 'Strikethrough' }).click();
    await expect(editor(page).locator('s')).toHaveText('Hello');
    await expect(panel).toBeHidden();
    await expect(editor(page)).toBeFocused();

    await more.click();
    await panel.getByRole('button', { name: 'Select font' }).click();
    await expect(popovers(page)).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(popovers(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(popovers(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Bold', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Italic', exact: true })).toBeFocused();
    await expectNoPageOverflow(page);
  });

  test('keeps contextual table tools in the header without a second row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const beforeHeader = await headerHeight(page);
    await setContent(page, '<table><tr><td>Cell</td><td>Two</td></tr></table>');
    await editor(page).locator('td').first().click();
    await expect(page.getByRole('button', { name: 'Cell fill' })).toBeVisible();
    expect(await headerHeight(page)).toBe(beforeHeader);
    await expectToolbarFits(page);
    await expectNoPageOverflow(page);
  });
});