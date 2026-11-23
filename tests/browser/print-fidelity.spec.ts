import { test, expect, type Page } from '@playwright/test';
import type { TiptapEditorHTMLElement } from '@tiptap/react';
import { createStarterGraphic, serializeSmartGraphic } from '../../src/lib/smartGraphic';
import {
  analyzePdf,
  capturePrintDocument,
  comparePdfPixels,
  expectFidelity,
  openAnalyzer,
  renderPrintedPdf,
  countHighlightPixels,
  stubPrint,
  ENGLISH_LABELS,
  type AnalyzedPdf,
  type PrintLabels,
} from './print-fidelity';

const GERMAN_LABELS: PrintLabels = {
  file: 'Datei',
  print: /^Drucken/,
  exportAs: 'Exportieren als',
  pdf: 'PDF-Dokument (.pdf)',
};

const editor = (page: Page) => page.locator('.ProseMirror[contenteditable=true]');

// Rendered-output comparison happens through Chromium's print-to-PDF, which
// the other engines' Playwright builds do not expose.
test.skip(({ browserName }) => browserName !== 'chromium', 'print-to-PDF rendering is Chromium-only');

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

async function exportPdf(page: Page, labels: PrintLabels = ENGLISH_LABELS): Promise<Buffer> {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: labels.file, exact: true }).click();
  await page.getByRole('menuitem', { name: labels.exportAs }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: labels.pdf }).click();
  const file = await download;
  const path = await file.path();
  if (!path) throw new Error('Download failed');
  await page.keyboard.press('Escape');
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

/** Direct Print's pages and the PDF export's pages, analyzed. */
async function printAndExport(
  page: Page,
  label: string,
  options: {
    printBackground?: boolean;
    labels?: PrintLabels;
    strictText?: boolean;
    pooledMeanLimit?: number;
    pooledMaxLimit?: number;
  } = {},
): Promise<{ printed: AnalyzedPdf; exported: AnalyzedPdf }> {
  const capture = await capturePrintDocument(page, options.labels);
  expect(capture.framePrints).toBeGreaterThanOrEqual(1);
  expect(capture.pagePrints).toBe(0);
  const printedPdf = await renderPrintedPdf(capture.html, { printBackground: options.printBackground });
  const exported = await exportPdf(page, options.labels);
  const analyzer = await openAnalyzer(page.context());
  const printed = await analyzePdf(analyzer, printedPdf);
  const exportAnalysis = await analyzePdf(analyzer, exported);
  const diffs = await comparePdfPixels(analyzer, printed, exportAnalysis);
  await analyzer.close();
  console.log(label, 'diffs', JSON.stringify(diffs));
  expectFidelity(printed, exportAnalysis, diffs, label, {
    strictText: options.strictText,
    pooledMeanLimit: options.pooledMeanLimit,
    pooledMaxLimit: options.pooledMaxLimit,
  });
  return { printed, exported: exportAnalysis };
}

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const graphic = serializeSmartGraphic({ ...createStarterGraphic('process-chevron'), title: 'Launch plan' });

const FILLER_PARAGRAPH =
  'Long paragraphs are the backbone of a printed document, and where they break across pages decides whether the output looks professionally paginated or accidentally cut. ';

const multipageDocument = `
<h1>Direct print fidelity</h1>
<p>This probe document exercises the paths where Direct Print and the PDF export could drift: paragraphs crossing boundaries, headings landing near page bottoms, nested lists, a quote, a long code block, a multi-page table, images and a Smart Graphic.</p>
<h2>Flowing paragraphs</h2>
<p>${FILLER_PARAGRAPH.repeat(2)}With bold <strong>sections</strong>, <em>emphasis</em>, <u>underlines</u>, a <mark style="background-color: #fef08a">highlight</mark> and H<sub>2</sub>O, E = mc<sup>2</sup>.</p>
<p>${FILLER_PARAGRAPH.repeat(3)}</p>
<p>${FILLER_PARAGRAPH.repeat(3)}</p>
<p>${FILLER_PARAGRAPH.repeat(3)}</p>
<h2>Structure and lists</h2>
<ul><li><p>First bullet paragraph</p><ul><li><p>Nested bullet long enough to wrap onto a second line inside the narrower indent, so markers, alignment and the square below all show</p><ul><li><p>Deepest square bullet</p></li></ul></li></ul></li><li><p>Second bullet</p></li></ul>
<ol start="4"><li><p>Fourth item, so the start attribute shows</p><ol><li><p>Numbered child</p></li><li><p>Second child with a longer label</p></li></ol></li><li><p>Fifth item</p></li></ol>
<blockquote><p>A blockquote wrapping over lines with italic style and a muted bar on its start edge, long enough to cross page boundaries during pagination of the printed document.</p></blockquote>
<pre><code>function compare(pageA, pageB) {
  // A long code block must not be pushed to a mostly empty page.
  return pageA.every((line, index) =&gt; line === pageB[index]);
}
${'const compact = "runs";\n'.repeat(26)}</code></pre>
<h2>Table across pages</h2>
<table><tbody><tr><th><p>Header A</p></th><th><p>Header B</p></th><th><p>Header C</p></th></tr>${Array.from({ length: 42 }, (_, i) => `<tr><td><p>Row ${i + 1} first cell</p></td><td><p>Row ${i + 1} second cell with more text in it so the row grows</p></td><td><p>Third</p></td></tr>`).join('')}</tbody></table>
<h2>Images and graphics</h2>
<p><a href="https://example.com/">A link</a>, <span style="color: rgb(185, 28, 28)">colored text</span> and inline <code>compute()</code> code.</p>
<img src="${PNG}" alt="Center" data-align="center" style="width: 50%;">
<img src="${PNG}" alt="Right" data-align="right" style="width: 25%;">
<p>Text beside the floated right image continues down the column while the float holds its side; later lines reclaim the full width again, which models float edges.</p>
<div data-lwrite-graphic='${graphic}'></div>
<h3>A closing section</h3>
<p>Final paragraph to close the document after the graphic, sized so it may share the last page or start another one.</p>
`;

const onePageDocument = `
<h2>One page document</h2>
<p>A single page of <strong>rich text</strong> with a <a href="https://example.com/">link</a>, a <mark style="background-color: #fef08a">highlight</mark>, inline <code>code</code>, H<sub>2</sub>O and a list:</p>
<ul><li><p>Alpha</p></li><li><p>Beta</p></li></ul>
`;

const rtlDocument = `
<h2>مستند ثنائي الاتجاه</h2>
<p>فقرة تبدأ من اليمين إلى اليسار مع كلمات لاتينية مثل LWrite و أرقام ١٢٣٤ بين النص العربي، لاختبار الاتجاه والمحاذاة في الطباعة المباشرة وتصدير PDF على حد سواء.</p>
<p>English words inside a right-to-left paragraph keep their own direction, وجه آخر للنص.</p>
`;

async function chooseGerman(page: Page) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: /^Language/ }).click();
  await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await page.keyboard.press('Escape');
}

test('Direct Print reproduces the PDF export page by page', async ({ page }) => {
  await stubPrint(page);
  await page.goto('/');
  await ready(page);
  await setContent(page, multipageDocument);
  await expect(page.locator('.lwrite-graphic-node')).toBeVisible();

  const { printed, exported } = await printAndExport(page, 'letter multipage');
  // More than one page really flowed through both pipelines.
  expect(printed.pageCount).toBeGreaterThan(4);

  // The table's header row repeats on every page that continues it.
  const headerPages = (analysis: AnalyzedPdf) => {
    const pages = analysis.pages.map((p, index) => (p.text.includes('Header A') ? index + 1 : 0)).filter(Boolean);
    return pages;
  };
  const repeatedOn = headerPages(printed);
  expect(repeatedOn.length, 'printed: header repetition').toBeGreaterThan(2);
  expect(headerPages(exported), 'exported: header repetition').toEqual(repeatedOn);

  // The letter page keeps its 1in margins in the print media.
  const firstLine = printed.pages[0]?.lines[0];
  expect(firstLine).toBeDefined();
  if (firstLine) {
    expect(Math.abs(firstLine.x - 72)).toBeLessThanOrEqual(2);
    // The heading line box starts flush at the top margin: its baseline sits
    // one line-height in, not a further 24pt band below the content top.
    const contentTop = 792 - 72;
    expect(firstLine.y).toBeLessThanOrEqual(contentTop);
    expect(contentTop - firstLine.y).toBeLessThanOrEqual(24);
    // The text column fills the content width.
    const widest = Math.max(...(printed.pages[0]?.lines.map((line) => line.end) ?? [0]));
    expect(widest).toBeGreaterThan(500);
  }
});

test('Direct Print lays out one-page documents identically', async ({ page }) => {
  await stubPrint(page);
  await page.goto('/');
  await ready(page);
  await setContent(page, onePageDocument);
  const { printed } = await printAndExport(page, 'letter one page');
  expect(printed.pageCount).toBe(1);
});

test('A4 locales print on A4, with the same geometry as the export', async ({ page }) => {
  await stubPrint(page);
  await page.goto('/');
  await ready(page);
  await chooseGerman(page);
  await setContent(page, multipageDocument);
  const { printed } = await printAndExport(page, 'A4 multipage', { labels: GERMAN_LABELS });
  expect(printed.pages[0]?.width ?? 0).toBeCloseTo(595.28, 0);
  expect(printed.pages[0]?.height ?? 0).toBeCloseTo(841.89, 0);
  expect(printed.pageCount).toBeGreaterThan(4);
});

test('dark editor themes print the same light document', async ({ page }) => {
  await stubPrint(page);
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/');
  await ready(page);
  await setContent(page, onePageDocument);
  const dark = await capturePrintDocument(page);
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await ready(page);
  await setContent(page, onePageDocument);
  const light = await capturePrintDocument(page);
  // The print document is the export's light document in both themes: the
  // document decides its own colors, never the editor chrome's.
  expect(dark.html).toBe(light.html);
  expect(dark.html).toContain('background:#fff');
});

test("backgrounds print without the browser's background-graphics switch", async ({ page }) => {
  await stubPrint(page);
  await page.goto('/');
  await ready(page);
  await setContent(page, onePageDocument);
  const capture = await capturePrintDocument(page);
  // printBackground: false stands for the reader's unchecked "Background
  // graphics"; the document's own backgrounds must still print
  // (print-color-adjust: exact), like the PDF export always draws them.
  const printedPdf = await renderPrintedPdf(capture.html, { printBackground: false });
  const analyzer = await openAnalyzer(page.context());
  const yellowPixels = await countHighlightPixels(analyzer, printedPdf);
  await analyzer.close();
  // The highlight's yellow rectangle (#fef08a) is painted behind the word,
  // even though the print pipeline's background switch is off.
  expect(yellowPixels).toBeGreaterThan(800);
});

test('right-to-left documents keep direction and margins on both paths', async ({ page }) => {
  await stubPrint(page);
  await page.goto('/');
  await ready(page);
  await setContent(page, rtlDocument);
  // The app's PDF export rasterizes scripts its bundled fonts cannot draw
  // (Arabic among them), while Direct Print keeps live text through the
  // browser's fonts; those pages compare through geometry and pixels.
  const { printed, exported } = await printAndExport(page, 'rtl', { strictText: false });
  expect(printed.pageCount).toBeGreaterThan(0);
  const heading = printed.pages[0]?.lines[0];
  if (heading) {
    // The Arabic heading hugs the right content edge of the letter page
    // (1in margins), not the left one.
    expect(Math.abs(heading.end - 540)).toBeLessThanOrEqual(6);
  }
  const arabic = printed.pages[0]?.text ?? '';
  expect(arabic).toContain('LWrite');
  expect(arabic).toContain('١٢٣٤');
  expect(exported.pages[0]?.text ?? '').toContain('LWrite');
  if (process.env.LWRITE_DEBUG_PNG) {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir('/tmp/rtl-debug', { recursive: true });
    await writeFile('/tmp/rtl-debug/printed.png', Buffer.from(printed.pages[0]?.png.split(',')[1] ?? '', 'base64'));
    await writeFile('/tmp/rtl-debug/exported.png', Buffer.from(exported.pages[0]?.png.split(',')[1] ?? '', 'base64'));
    console.log('printed lines', JSON.stringify(printed.pages[0]?.lines));
    console.log('exported lines', JSON.stringify(exported.pages[0]?.lines));
  }
  // The Latin run inside the Arabic paragraph sits at the same place on both
  // paths, so the bidi paragraph's layout — not just its ink — is shared.
  // Compared through the run's own text item: rasterized Arabic pieces are
  // images and never appear in a page's text items, so the line boxes of
  // mixed-direction lines are not comparable.
  const latinRun = (analysis: AnalyzedPdf) =>
    analysis.pages.flatMap((p) => p.items).find((item) => item.text.includes('English words inside'));
  const printedLatin = latinRun(printed);
  const exportedLatin = latinRun(exported);
  expect(printedLatin).toBeDefined();
  expect(exportedLatin).toBeDefined();
  if (printedLatin && exportedLatin) {
    expect(Math.abs(printedLatin.y - exportedLatin.y)).toBeLessThanOrEqual(2.5);
    expect(Math.abs(printedLatin.x - exportedLatin.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(printedLatin.end - exportedLatin.end)).toBeLessThanOrEqual(3);
  }
});
