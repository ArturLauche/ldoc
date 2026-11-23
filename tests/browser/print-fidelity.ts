/**
 * Direct Print fidelity helpers: capture the print document the app prepares,
 * render it through Chromium's print pipeline, and compare it with the app's
 * PDF export — pages, text geometry and pixels (pdfjs runs inside the page).
 */
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const PDFJS = () => resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.min.mjs');
const PDFJS_WORKER = () => resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');

interface ProbeState {
  framePrints: number;
  pagePrints: number;
  frames: Set<Window>;
}

/** Records print calls instead of opening a native dialog, in this page and in every frame it creates. */
export async function stubPrint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = ((window as unknown as { __lwriteProbe: ProbeState }).__lwriteProbe ??= {
      framePrints: 0,
      pagePrints: 0,
      frames: new Set(),
    });
    window.print = () => {
      probe.pagePrints += 1;
    };
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
          if (view && !probe.frames.has(view)) {
            probe.frames.add(view);
            try {
              view.print = () => {
                probe.framePrints += 1;
              };
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

/** Locale-aware menu labels, so the probe can drive a localized interface. */
export interface PrintLabels {
  file: string;
  print: RegExp;
  exportAs: string;
  pdf: string;
}

export const ENGLISH_LABELS: PrintLabels = {
  file: 'File',
  print: /^Print/,
  exportAs: 'Export as',
  pdf: 'PDF document (.pdf)',
};

export interface PrintCapture {
  /** The frame's document HTML, after the app's pre-print preparation passes. */
  html: string;
  framePrints: number;
  pagePrints: number;
}

/** Runs the app's Print command and hands back the print document it prepared. */
export async function capturePrintDocument(page: Page, labels: PrintLabels = ENGLISH_LABELS): Promise<PrintCapture> {
  await page.getByRole('button', { name: labels.file, exact: true }).click();
  await page.getByRole('menuitem', { name: labels.print }).click();
  await page.waitForFunction(() => {
    const probe = (window as unknown as { __lwriteProbe?: { framePrints: number } }).__lwriteProbe;
    return (probe?.framePrints ?? 0) >= 1;
  });
  const capture = await page.evaluate(() => {
    const probe = (window as unknown as { __lwriteProbe: ProbeState }).__lwriteProbe;
    const frame = document.querySelector('iframe[data-lwrite-print]') as HTMLIFrameElement | null;
    const doc = frame?.contentDocument;
    return {
      // The print document is only the frame; stamp a doctype so `setContent`
      // rebuilds it exactly.
      html: doc ? `<!DOCTYPE html>${doc.documentElement.outerHTML}` : '',
      framePrints: probe.framePrints,
      pagePrints: probe.pagePrints,
    };
  });
  // Let the app release the frame like a closed dialog would.
  await page.evaluate(() => {
    const frame = document.querySelector('iframe[data-lwrite-print]') as HTMLIFrameElement | null;
    frame?.contentWindow?.dispatchEvent(new Event('afterprint'));
  });
  expect(capture.html.length).toBeGreaterThan(0);
  return capture;
}

/**
 * Chromium's print pipeline, with unhinted font metrics: the typographic
 * advances the PDF export computes and desktop browsers render by default.
 * Headless containers hint advances to whole pixels, which would make the
 * comparison measure the container, not the app.
 */
export async function renderPrintedPdf(html: string, options: { printBackground?: boolean } = {}): Promise<Buffer> {
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: options.printBackground !== false }));
  } finally {
    await browser.close();
  }
}

export interface TextLine {
  y: number;
  x: number;
  end: number;
  text: string;
}

export interface TextItem {
  x: number;
  end: number;
  y: number;
  text: string;
}

export interface AnalyzedPage {
  width: number;
  height: number;
  lines: TextLine[];
  /** The text of every page item, sorted top down and left to right. */
  text: string;
  /** Raw text items in reading order (rasterized glyphs never appear here). */
  items: TextItem[];
  /** PNG render (scale 1.5) as a data URL. */
  png: string;
}

export interface AnalyzedPdf {
  pageCount: number;
  pages: AnalyzedPage[];
}

/** A fresh page with pdfjs routed in from node_modules, for analysis work. */
export async function openAnalyzer(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.route('**/blank.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html><body></body></html>' }),
  );
  await page.route('**/pdfjs/pdf.mjs', (route) => route.fulfill({ path: PDFJS(), contentType: 'text/javascript' }));
  await page.route('**/pdfjs/pdf.worker.mjs', (route) =>
    route.fulfill({ path: PDFJS_WORKER(), contentType: 'text/javascript' }),
  );
  await page.goto('http://fidelity.local/blank.html');
  return page;
}

/** Extracts page geometry, grouped text lines and page renders with pdfjs. */
export async function analyzePdf(page: Page, bytes: Buffer): Promise<AnalyzedPdf> {
  return page.evaluate(async (base64) => {
    const pdfjs = (await import('/pdfjs/pdf.mjs' as string)) as typeof import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const scale = 1.5;
    const pages: Array<{ width: number; height: number; lines: TextLine[]; text: string; items: TextItem[]; png: string }> = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const pdfPage = await doc.getPage(n);
      const viewport = pdfPage.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      const png = canvas.toDataURL('image/png');
      const height = viewport.height / scale;
      const rawItems = (await pdfPage.getTextContent()).items as Array<{
        str: string;
        width: number;
        transform: number[];
      }>;
      // Items in reading order: top line first, left to right, so drawn list
      // markers and separately drawn baseline shifts stay comparable.
      const items = rawItems
        .filter((item) => item.str.trim().length > 0)
        .map((item) => ({ str: item.str, x: item.transform[4], y: height - item.transform[5], w: item.width }))
        // Top-origin reading order: first line of the page first.
        .sort((a, b) => a.y - b.y || a.x - b.x);
      // Baselines within one line height belong together (sub- and
      // superscripts sit a fraction of an em off the baseline).
      interface LineBox {
        y: number;
        x: number;
        end: number;
        texts: string[];
      }
      const lines: LineBox[] = [];
      items.forEach((item) => {
        // Subscripts and superscripts sit a fraction of an em off the baseline.
        const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
        if (line) {
          line.texts.push(item.str);
          line.end = Math.max(line.end, item.x + item.w);
        } else {
          lines.push({ y: item.y, x: item.x, end: item.x + item.w, texts: [item.str] });
        }
      });
      pages.push({
        width: viewport.width / scale,
        height,
        items: items.map((item) => ({
          x: Math.round(item.x * 10) / 10,
          end: Math.round((item.x + item.w) * 10) / 10,
          y: Math.round(item.y * 10) / 10,
          text: item.str,
        })),
        lines: lines.map((line) => ({
          y: Math.round(line.y * 10) / 10,
          x: Math.round(line.x * 10) / 10,
          end: Math.round(line.end * 10) / 10,
          text: line.texts.join(' ').replace(/\s+/g, ' ').trim(),
        })),
        text: items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim(),
        png,
      });
    }
    return { pageCount: pages.length, pages };
  }, bytes.toString('base64'));
}

export interface PixelDiff {
  changedFraction: number;
  meanDelta: number;
  /** Largest 8×8 average block difference (antialiasing noise cancels; layout drift stays). */
  pooledMax: number;
  pooledMean: number;
}

/**
 * Counts the pixels of a printed page that match the highlight's yellow
 * (#fef08a): the colored rectangle behind the word, whichever position the
 * text wraps to. A page without the painted highlight has none.
 */
export async function countHighlightPixels(analyzer: Page, bytes: Buffer): Promise<number> {
  return analyzer.evaluate(async (base64) => {
    const pdfjs = (await import('/pdfjs/pdf.mjs' as string)) as typeof import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs';
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
    const doc = await pdfjs.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const [red, green, blue] = [pixels[index], pixels[index + 1], pixels[index + 2]];
      // The highlight's #fef08a, blended by antialiasing inside every glyph.
      if (red > 230 && green > 215 && blue > 90 && blue < 200) count += 1;
    }
    return count;
  }, bytes.toString('base64'));
}

/** Pixel metrics between the two documents' page renders, page by page. */
export async function comparePdfPixels(
  analyzer: Page,
  printed: AnalyzedPdf,
  exported: AnalyzedPdf,
): Promise<PixelDiff[]> {
  const pairs = printed.pages.map((page, index) => [
    page.png,
    exported.pages[index]?.png ?? exported.pages[exported.pages.length - 1]?.png ?? '',
  ]);
  return analyzer.evaluate(
    (rawPngs) => {
      const pngs = rawPngs as [string, string][];
      const decode = (dataUrl: string) =>
        new Promise<ImageData>((resolveDefer, reject) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
            context.drawImage(image, 0, 0);
            resolveDefer(context.getImageData(0, 0, image.width, image.height));
          };
          image.onerror = () => reject(new Error('the page render did not decode'));
          image.src = dataUrl;
        });
      return Promise.all(pngs.map((pair) => Promise.all([decode(pair[0]), decode(pair[1])]))).then((decoded) =>
        decoded.map(([a, b]) => {
          let changed = 0;
          let sum = 0;
          let pooledMax = 0;
          let pooledSum = 0;
          let pooledCount = 0;
          const pool = 8;
          for (let y = 0; y < a.height; y += 1) {
            for (let x = 0; x < a.width; x += 1) {
              const index = (y * a.width + x) * 4;
              const delta =
                Math.abs(a.data[index] - b.data[index]) +
                Math.abs(a.data[index + 1] - b.data[index + 1]) +
                Math.abs(a.data[index + 2] - b.data[index + 2]);
              sum += delta;
              if (delta > 48) changed += 1;
            }
          }
          for (let py = 0; py * pool < a.height; py += 1) {
            for (let px = 0; px * pool < a.width; px += 1) {
              let redA = 0;
              let greenA = 0;
              let blueA = 0;
              let redB = 0;
              let greenB = 0;
              let blueB = 0;
              let count = 0;
              for (let y = py * pool; y < (py + 1) * pool && y < a.height; y += 1) {
                for (let x = px * pool; x < (px + 1) * pool && x < a.width; x += 1) {
                  const index = (y * a.width + x) * 4;
                  redA += a.data[index];
                  greenA += a.data[index + 1];
                  blueA += a.data[index + 2];
                  redB += b.data[index];
                  greenB += b.data[index + 1];
                  blueB += b.data[index + 2];
                  count += 1;
                }
              }
              const delta = Math.abs(redA - redB) / count + Math.abs(greenA - greenB) / count + Math.abs(blueA - blueB) / count;
              pooledMax = Math.max(pooledMax, delta);
              pooledSum += delta;
              pooledCount += 1;
            }
          }
          return {
            changedFraction: changed / (a.width * a.height),
            meanDelta: sum / (a.width * a.height * 4),
            pooledMax,
            pooledMean: pooledSum / pooledCount,
          };
        }),
      );
    },
    pairs,
  );
}

export interface FidelityOptions {
  /**
   * Compare per-page text, line counts and line positions. Scripts the app's
   * PDF export draws as rasterized glyphs (no embedded font covers them)
   * print as live text, so those pages compare through geometry and pixels
   * instead.
   */
  strictText?: boolean;
  /** Relaxed pooled-pixel bounds for pages whose glyph rendering differs in kind. */
  pooledMeanLimit?: number;
  pooledMaxLimit?: number;
}

/** The parity Direct Print promises: the same words on the same pages, at the same positions. */
export function expectFidelity(
  printed: AnalyzedPdf,
  exported: AnalyzedPdf,
  diffs: PixelDiff[],
  label: string,
  options: FidelityOptions = {},
): void {
  const strictText = options.strictText ?? true;
  const pooledMeanLimit = options.pooledMeanLimit ?? 8;
  const pooledMaxLimit = options.pooledMaxLimit ?? 220;
  expect(exported.pageCount, `${label}: page count`).toBe(printed.pageCount);
  if (printed.pages.length === 0) return;
  const width = printed.pages[0]?.width ?? 0;
  const height = printed.pages[0]?.height ?? 0;
  expect(width, `${label}: page width`).toBeGreaterThan(0);
  // Browsers may quantize paper sizes at print time (Chromium's A4 is
  // 594.96pt, a tenth of a millimetre under ISO A4); geometry parity keeps a
  // half-point of slack for that, nothing more.
  expect(Math.abs((exported.pages[0]?.width ?? 0) - width), `${label}: page width parity`).toBeLessThanOrEqual(0.5);
  expect(Math.abs((exported.pages[0]?.height ?? 0) - height), `${label}: page height parity`).toBeLessThanOrEqual(0.5);
  const pageCount = Math.min(printed.pages.length, exported.pages.length);
  for (let index = 0; index < pageCount; index += 1) {
    const printedPage = printed.pages[index] as AnalyzedPage;
    const exportedPage = exported.pages[index] as AnalyzedPage;
    if (strictText) {
      expect(printedPage.text, `${label}: page ${index + 1} text`).toBe(exportedPage.text);
      expect(printedPage.lines.length, `${label}: page ${index + 1} line count`).toBe(exportedPage.lines.length);
      const lines = Math.min(printedPage.lines.length, exportedPage.lines.length);
      for (let line = 0; line < lines; line += 1) {
        const printedLine = printedPage.lines[line] as TextLine;
        const exportedLine = exportedPage.lines[line] as TextLine;
        expect(Math.abs(printedLine.y - exportedLine.y), `${label}: page ${index + 1} line ${line + 1} y`).toBeLessThanOrEqual(2);
        expect(Math.abs(printedLine.x - exportedLine.x), `${label}: page ${index + 1} line ${line + 1} x`).toBeLessThanOrEqual(2);
      }
    }
    const diff = diffs[index];
    // Antialiasing noise survives the pooled comparison in single digits; a
    // layout shift moves whole blocks.
    expect(diff?.pooledMean ?? 0, `${label}: page ${index + 1} pooled mean`).toBeLessThan(pooledMeanLimit);
    expect(diff?.pooledMax ?? 0, `${label}: page ${index + 1} pooled max`).toBeLessThan(pooledMaxLimit);
  }
}
