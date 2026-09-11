import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const MiB = 1024 * 1024;
const editor = (page: Page) => page.locator('.ProseMirror[contenteditable=true]');
async function ready(page: Page) {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(editor(page)).toBeVisible();
}
async function save(page: Page) {
  await editor(page).press('Control+s');
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
}
async function openFile(page: Page, name: string, buffer: Buffer) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Open...', exact: true }).click();
  await (await chooser).setFiles({ name, mimeType: 'text/html', buffer });
  await expect(page.getByRole('textbox', { name: 'Document name', exact: true })).toHaveValue(
    name.replace(/\.[^.]+$/, ''),
  );
  await ready(page);
}

// A valid ancillary PNG chunk pads a tiny decodable image to the accepted limit.
function imageAtLimit() {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
    'base64',
  );
  const chunk = Buffer.alloc(10 * MiB - image.length);
  chunk.writeUInt32BE(chunk.length - 12);
  chunk.write('npAD', 4, 'ascii');
  let crc = 0xffffffff;
  const table = Array.from({ length: 256 }, (_, value) => {
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  for (const byte of chunk.subarray(4, -4)) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([image.subarray(0, -12), chunk, image.subarray(-12)]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await ready(page);
});

test('an accepted 10 MB image survives saving and a fresh page load', async ({ page }) => {
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Insert Image',
    exact: true,
  });
  await dialog.getByLabel('Alt text (optional)').fill('Full size image');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: /^Click to upload or drag and drop/ }).click();
  const bytes = imageAtLimit();
  expect(bytes.length).toBe(10 * MiB);
  await (await chooser).setFiles({ name: 'at-limit.png', mimeType: 'image/png', buffer: bytes });
  await expect(dialog).not.toBeVisible();
  await save(page);
  await page.reload();
  await ready(page);
  await expect(editor(page).getByRole('img', { name: 'Full size image' })).toBeVisible();
  expect(
    await editor(page)
      .locator('img')
      .evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        return { width: image.naturalWidth, length: image.src.length };
      }),
  ).toEqual({
    width: 1,
    length: 'data:image/png;base64,'.length + Math.ceil(bytes.length / 3) * 4,
  });
  expect(await page.evaluate(() => localStorage.getItem('lwrite-current-doc'))).toBeNull();
});

test('an accepted 20 MB HTML document survives saving and reloading', async ({ page }) => {
  // Exercise the exact persistence boundary with paragraphs, rather than the
  // browser's pathological line layout for a single 20-million-character word.
  const paragraph = `<p>${'Sample text. '.repeat(320).slice(0, 4088)}x</p>`;
  const bytes = Buffer.from(paragraph.repeat(5120));
  const textLength = 20 * MiB - '<p></p>'.length * 5120;
  expect(bytes.length).toBe(20 * MiB);
  await openFile(page, 'at-limit.html', bytes);
  await save(page);
  await page.reload();
  await ready(page);
  expect(await editor(page).evaluate((element) => element.textContent?.length)).toBe(textLength);
  await expect(page.getByRole('textbox', { name: 'Document name', exact: true })).toHaveValue(
    'at-limit',
  );
});

test('navigation to a legal page flushes edits before the editor is destroyed', async ({
  page,
}) => {
  await editor(page).fill('Last edit before route navigation.');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goBack();
  await ready(page);
  await expect(editor(page)).toHaveText('Last edit before route navigation.');
});

test('conflict backups preserve the saved version and live draft without saving', async ({
  page,
  context,
}) => {
  await editor(page).fill('Original shared draft');
  await save(page);
  const other = await context.newPage();
  await other.goto('/');
  await ready(other);
  await editor(page).fill('My unsaved draft');
  await editor(other).fill('Other tab saved version');
  await save(other);
  await expect(page.getByRole('button', { name: 'Save as a copy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Library Transfer', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export All Docs (.json)', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8')) as {
    documents: { id: string; content: string }[];
  };
  expect(backup.documents.map((doc) => doc.content)).toEqual(
    expect.arrayContaining(['<p>My unsaved draft</p>', '<p>Other tab saved version</p>']),
  );
  expect(new Set(backup.documents.map((doc) => doc.id)).size).toBe(backup.documents.length);
  await other.reload();
  await ready(other);
  await expect(editor(other)).toHaveText('Other tab saved version');
});

test('DOCX and ODT still round-trip through the bounded archive importer', async ({ page }) => {
  await openFile(
    page,
    'roundtrip.html',
    Buffer.from(
      '<h1>Report</h1><p>Archive round trip.</p><p><strong>Important text</strong></p><table><tr><td>Cell</td></tr></table>',
    ),
  );
  await save(page);
  for (const [extension, label] of [
    ['docx', 'Word Document (.docx)'],
    ['odt', 'OpenDocument Text (.odt)'],
  ]) {
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Export As', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    const bytes = await readFile((await (await download).path())!);
    await openFile(page, `roundtrip-${extension}.${extension}`, bytes);
    await expect(editor(page)).toContainText('Archive round trip.');
    await expect(editor(page).locator('table')).toContainText('Cell');
    await save(page);
  }
});
