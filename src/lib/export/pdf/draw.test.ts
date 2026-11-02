import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStarterGraphic } from '@/lib/smartGraphic';
import { serveExportAssets } from '@/test/exportAssets';
import type { SceneLinearGradient } from '../graphics/scene';
import { extractExportDocumentFromHtml } from '../model';
import { roundedRectPath } from '../graphics/scene';
import { pageGeometry } from '../typography';
import type { ExportDocumentModel } from '../types';
import { WarningCollector } from '../warnings';
import { PageCanvas, type DrawEnvironment } from './draw';
import type { PdfTextFont } from './fonts';
import type { PlacedGlyph } from './inline';
import { renderPdf } from './index';

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => {
  assets = serveExportAssets();
});
afterEach(() => assets.restore());

async function pdfOf(model: ExportDocumentModel) {
  const blob = await renderPdf(model, new WarningCollector('pdf'));
  return PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false });
}

function pageContent(pdf: PDFDocument): string {
  const contents = pdf.getPage(0).node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => pdf.context.lookup(ref)) : [contents];
  return streams
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n');
}

const gradient = (alphas: [number, number]): SceneLinearGradient => ({
  kind: 'linear',
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 40,
  stops: alphas.map((a, index) => ({ offset: index, color: { r: 37, g: 99, b: 235, a } })),
});

describe('PDF drawing', () => {
  it('gives gradients their stop opacity', async () => {
    const model = extractExportDocumentFromHtml({ html: '<div data-lwrite-graphic></div>', name: 'G', locale: 'en' });
    model.blocks = [
      {
        type: 'graphic',
        layoutId: 'process-chevron',
        title: '',
        items: [],
        model: createStarterGraphic('process-chevron'),
        scene: {
          width: 200,
          height: 40,
          items: [
            { kind: 'shape', path: roundedRectPath(0, 0, 90, 40), fill: gradient([0.5, 0.5]) },
            { kind: 'shape', path: roundedRectPath(100, 0, 90, 40), fill: gradient([1, 0.2]) },
          ],
        },
      },
    ];
    const pdf = await pdfOf(model);
    const states = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('ExtGState'), PDFDict);
    const entries = Array.from(states?.entries() ?? [], ([, ref]) => pdf.context.lookup(ref, PDFDict));
    // A shared alpha is a constant; varying alphas are a luminosity soft mask.
    expect(entries.some((entry) => (entry.get(PDFName.of('ca')) as PDFNumber | undefined)?.asNumber() === 0.5)).toBe(true);
    const masked = entries.find((entry) => entry.has(PDFName.of('SMask')));
    expect(masked?.lookup(PDFName.of('SMask'), PDFDict).get(PDFName.of('S'))).toBe(PDFName.of('Luminosity'));
  });

  it('stretches the spaces of justified lines', async () => {
    const words = 'Justified text spreads its words across the whole column width on every line but the last one. '.repeat(3);
    const draw = async (align: string) =>
      pageContent(await pdfOf(extractExportDocumentFromHtml({ html: `<p style="text-align: ${align}">${words}</p>`, name: 'J', locale: 'en' })));
    // TJ adjustments are in thousandths of the font size; a stretched space is a large negative one.
    const largest = (content: string) =>
      Math.min(0, ...Array.from(content.matchAll(/\[([^\]]*)\]\s*TJ/g)).flatMap((match) => match[1].match(/-?\d+(?:\.\d+)?(?=\s|<|$)/g) ?? []).map(Number));
    expect(largest(await draw('justify'))).toBeLessThan(-100);
    expect(largest(await draw('left'))).toBeGreaterThan(-100);
  });

  it('draws Smart Graphic labels set in a system font', async () => {
    const model = extractExportDocumentFromHtml({ html: '<div data-lwrite-graphic></div>', name: 'G', locale: 'en' });
    model.blocks = [
      {
        type: 'graphic',
        layoutId: 'process-chevron',
        title: '',
        items: [],
        model: createStarterGraphic('process-chevron'),
        scene: {
          width: 200,
          height: 40,
          items: [
            {
              kind: 'text',
              text: 'Hello',
              x: 10,
              y: 20,
              anchor: 'start',
              width: 40,
              font: { family: 'Arial', weight: 400, italic: false, size: 16 },
              color: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        },
      },
    ];
    const content = pageContent(await pdfOf(model));
    // System families draw with a PDF standard font, like body text does.
    expect(content).toMatch(/ Tj| TJ/);
  });

  it('draws list numbers when the document font cannot load', async () => {
    const serve = globalThis.fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/fonts/dm-sans.css')) return Promise.reject(new TypeError('Failed to fetch'));
      return serve(input, init);
    });
    const model = extractExportDocumentFromHtml({
      html: '<ol><li><p>One</p></li></ol>',
      name: 'L',
      locale: 'en',
    });
    const content = pageContent(await pdfOf(model));
    // "1." in WinAnsi hex; the body still falls back to Helvetica.
    expect(content).toContain('312E');
  });

  it('returns to the baseline after a glyph with an offset', async () => {
    const document = await PDFDocument.create();
    const page = document.addPage([595.28, 841.89]);
    const standard = await document.embedFont(StandardFonts.Helvetica);
    const font: PdfTextFont = {
      key: 'test-font',
      ref: standard.ref,
      synthesizes: false,
      metrics: {
        unitsPerEm: 1000,
        ascent: 800,
        descent: -200,
        underlinePosition: -100,
        underlineThickness: 50,
        strikeoutPosition: 300,
        strikeoutSize: 50,
      },
      encode: (glyphs) => PDFHexString.of(glyphs.map((glyph) => glyph.id.toString(16).padStart(4, '0')).join('')),
      defaultAdvance: () => 500,
    };
    const env = {
      document,
      geometry: pageGeometry('en'),
      fonts: {} as DrawEnvironment['fonts'],
      registry: {} as DrawEnvironment['registry'],
      images: new Map(),
      rasters: new Map(),
    };
    const canvas = new PageCanvas(page, env);
    const glyphs: PlacedGlyph[] = [
      { id: 1, text: 'a', advance: 10, xOffset: 0, yOffset: 0 },
      // A combining acute above the baseline.
      { id: 2, text: '\u0301', advance: 0, xOffset: 0, yOffset: -3 },
      { id: 3, text: 'b', advance: 10, xOffset: 0, yOffset: 0 },
    ];

    canvas.glyphs(font, 16, glyphs, 0, 100, '#000000');

    const matrices = canvas.ops
      .map((operator) => operator.toString())
      .filter((operator) => operator.endsWith(' Tm'))
      .map((operator) => operator.split(' ').map(Number));
    // One matrix per glyph: the glyph after the mark must start at the pen
    // position and baseline, not inherit the mark's shift.
    expect(matrices).toHaveLength(3);
    const [, , , , x, y] = matrices[2];
    expect(x).toBeCloseTo(canvas.x(10));
    expect(y).toBeCloseTo(canvas.y(100));
  });
});
