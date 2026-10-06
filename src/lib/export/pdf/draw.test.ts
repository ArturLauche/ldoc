import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStarterGraphic } from '@/lib/smartGraphic';
import { serveExportAssets } from '@/test/exportAssets';
import type { SceneLinearGradient } from '../graphics/scene';
import { extractExportDocumentFromHtml } from '../model';
import { roundedRectPath } from '../graphics/scene';
import type { ExportDocumentModel } from '../types';
import { WarningCollector } from '../warnings';
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
});
