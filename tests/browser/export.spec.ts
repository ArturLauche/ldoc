import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { SMART_GRAPHIC_LAYOUT_IDS, createStarterGraphic, serializeSmartGraphic } from '../../src/lib/smartGraphic';
import JSZip from 'jszip';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
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

const FORMAT_LABELS = {
  txt: 'Plain text (.txt)',
  html: 'Web page (.html)',
  rtf: 'Rich Text Format (.rtf)',
  docx: 'Word document (.docx)',
  odt: 'OpenDocument text (.odt)',
  pdf: 'PDF document (.pdf)',
} as const;

async function exportAs(page: Page, format: keyof typeof FORMAT_LABELS): Promise<{ name: string; bytes: Buffer }> {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export as' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: FORMAT_LABELS[format] }).click();
  const file = await download;
  const path = await file.path();
  if (!path) throw new Error('Download failed');
  await page.keyboard.press('Escape');
  return { name: file.suggestedFilename(), bytes: await readFile(path) };
}

const graphic = JSON.stringify({
  version: 1,
  layoutId: 'process-chevron',
  colorSet: 'theme',
  style: 'filled',
  title: 'Launch plan',
  items: [
    { id: 'a1', label: 'Research', children: [] },
    { id: 'b2', label: 'Build', children: [] },
    { id: 'c3', label: 'Ship', children: [] },
  ],
});

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const documentHtml = `
  <h1>Quarterly report</h1>
  <p>Body with <strong>bold</strong>, <em>italic</em>, <span style="font-family: Inter">Inter text</span> and a <a href="https://example.com/">link</a>.</p>
  <ul><li><p>First</p><ul><li><p>Nested</p></li></ul></li><li><p>Second</p></li></ul>
  <ol start="3"><li><p>Three</p></li><li><p>Four</p></li></ol>
  <blockquote><p>Quoted words</p></blockquote>
  <table><tbody><tr><th colspan="2"><p>Head</p></th></tr><tr><td><p>A</p></td><td data-background-color="#1e40af"><p>B</p></td></tr></tbody></table>
  <img src="${PNG}" alt="Pixel" data-align="left" data-width="10">
  <p>${'Text flows beside the floating image and continues below it. '.repeat(6)}</p>
  <div data-lwrite-graphic='${graphic}'></div>
  <pre><code>const answer = 42;</code></pre>
`;

test.describe('document export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await setContent(page, documentHtml);
    await expect(page.locator('.lwrite-graphic-node')).toBeVisible();
  });

  test('exports every format locally with fonts and Smart Graphic drawings', async ({ page }, testInfo) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://127.0.0.1:4178/') && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) {
        external.push(request.url());
      }
    });

    const txt = await exportAs(page, 'txt');
    expect(txt.name).toMatch(/\.txt$/);
    expect(txt.bytes.toString('utf8')).toContain('Launch plan');

    const pdf = await exportAs(page, 'pdf');
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const loaded = await PDFDocument.load(pdf.bytes, { updateMetadata: false });
    const fonts = loaded.context
      .enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFDict => object instanceof PDFDict && object.get(PDFName.of('Subtype')) === PDFName.of('Type0'))
      .map((dict) => dict.get(PDFName.of('BaseFont'))?.toString() ?? '');
    expect(fonts.some((name) => name.includes('DMSans'))).toBe(true);
    expect(fonts.some((name) => name.includes('Inter'))).toBe(true);
    expect(loaded.getTitle()).toBeTruthy();

    const docxFile = await exportAs(page, 'docx');
    expect(docxFile.name).toMatch(/\.docx$/);
    await writeFile(testInfo.outputPath('editable-smart-graphic.docx'), docxFile.bytes);
    const docx = await JSZip.loadAsync(docxFile.bytes);
    const docxMedia = Object.keys(docx.files).filter((name) => name.startsWith('word/media/'));
    // Only the actual photograph is media; the graphic is editable Word shapes.
    expect(docxMedia.some((name) => name.endsWith('.svg'))).toBe(false);
    expect(docxMedia.filter((name) => name.endsWith('.png')).length).toBe(1);
    const docxXml = await docx.file('word/document.xml')!.async('string');
    expect(docxXml).toContain('<wpg:wgp>');
    expect(docxXml).toContain('<wps:txbx>');
    for (const label of ['Launch plan', 'Research', 'Build', 'Ship']) {
      expect(docxXml).toContain(`>${label}</w:t>`);
    }
    expect(Object.keys(docx.files).some((name) => name.startsWith('word/fonts/'))).toBe(true);

    const odt = await JSZip.loadAsync(await exportAs(page, 'odt').then((file) => file.bytes));
    expect(Object.keys(odt.files).some((name) => /^Pictures\/.*\.svg$/.test(name))).toBe(true);
    expect(Object.keys(odt.files).some((name) => /^Fonts\/.*\.ttf$/.test(name))).toBe(true);

    const rtf = (await exportAs(page, 'rtf')).bytes.toString('latin1');
    expect(rtf).toContain('\\pngblip');
    expect(rtf).toContain('\\trowd');

    const html = (await exportAs(page, 'html')).bytes.toString('utf8');
    expect(html).toContain('class="lwrite-graphic-drawing"');
    expect(html).toContain('data-lwrite-graphic');
    expect(html).toMatch(/@font-face\{font-family:'Inter'/);

    expect(external).toEqual([]);
  });

  test('every Smart Graphic layout exports editable shapes and labels without media', async ({ page }, testInfo) => {
    const models = SMART_GRAPHIC_LAYOUT_IDS.map((id) => ({ ...createStarterGraphic(id), title: id }));
    const html = models.map((model) => `<div data-lwrite-graphic='${serializeSmartGraphic(model)}'></div>`).join('');
    await setContent(page, html);
    const file = await exportAs(page, 'docx');
    await writeFile(testInfo.outputPath('all-smart-graphics.docx'), file.bytes);
    const zip = await JSZip.loadAsync(file.bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    const counts = await page.evaluate((source) => {
      const document = new DOMParser().parseFromString(source, 'application/xml');
      return {
        errors: document.getElementsByTagName('parsererror').length,
        groups: Array.from(document.getElementsByTagNameNS('http://schemas.microsoft.com/office/word/2010/wordprocessingGroup', 'wgp')).map((group) => group.textContent),
      };
    }, xml);
    expect(counts.errors).toBe(0);
    expect(counts.groups).toHaveLength(models.length);
    const labels = (items: typeof models[number]['items']): string[] => items.flatMap((item) => [item.label, ...labels(item.children)]);
    for (const [index, model] of models.entries()) {
      expect(counts.groups[index]).toContain(model.title);
      for (const label of labels(model.items)) expect(counts.groups[index]).toContain(label);
    }
    expect(Object.keys(zip.files).filter((path) => path.startsWith('word/media/'))).toEqual([]);
  });

  test('HTML export is self-contained and matches the editor layout', async ({ page, context }) => {
    const html = (await exportAs(page, 'html')).bytes.toString('utf8');

    const blocks = 'h1,h2,h3,p,li,pre,blockquote,table,img,div.lwrite-graphic,.lwrite-graphic-node';
    // Block boxes relative to the document's content box.
    const measure = ({ root, blocks }: { root: string; blocks: string }) => {
      const container = document.querySelector(root) as HTMLElement;
      const style = getComputedStyle(container);
      const box = container.getBoundingClientRect();
      const top = box.top + parseFloat(style.paddingTop);
      const left = box.left + parseFloat(style.paddingLeft);
      return Array.from(container.querySelectorAll(blocks))
        .filter((element) => !element.parentElement?.closest('.lwrite-graphic-node, div.lwrite-graphic'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { x: Math.round(rect.left - left), y: Math.round(rect.top - top), w: Math.round(rect.width), h: Math.round(rect.height) };
        });
    };
    const inEditor = await page.evaluate(measure, { root: '.ProseMirror', blocks });

    // Opened offline, the file still has its fonts, images and drawings.
    const viewer = await context.newPage();
    await viewer.route('**/*', (route) => route.abort());
    await viewer.setViewportSize(page.viewportSize() ?? { width: 1280, height: 720 });
    await viewer.setContent(html);
    await viewer.evaluate(() => document.fonts.ready);
    expect(await viewer.evaluate(() => document.fonts.check('16px "DM Sans"'))).toBe(true);
    expect(await viewer.locator('svg.lwrite-graphic-drawing text').first().textContent()).toBeTruthy();

    const exported = await viewer.evaluate(measure, { root: 'main', blocks });
    expect(exported).toHaveLength(inEditor.length);
    // The editor keeps the first heading's top margin inside its page; the file starts at it.
    const offset = inEditor[0].y - exported[0].y;
    exported.forEach((box, index) => {
      const expected = inEditor[index];
      expect.soft(Math.abs(box.y + offset - expected.y), `block ${index} top`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(box.h - expected.h), `block ${index} height`).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(box.x - expected.x), `block ${index} left`).toBeLessThanOrEqual(1);
    });
  });
});
