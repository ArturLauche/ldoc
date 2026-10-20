import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveExportAssets } from '@/test/exportAssets';
import { noteDocumentFonts } from '../textUsage';
import { ExportFontRegistry } from '../fonts/registry';
import { createStarterGraphic, serializeSmartGraphic, updateGraphicTitle } from '@/lib/smartGraphic';
import { extractExportDocumentFromHtml } from '../model';
import { graphicToFallbackBlocks, imagePlaceholderRuns } from '../shared';
import { DOCUMENT_STYLE, textBaseStyle, type TextContext } from '../typography';
import type { ExportBlock, ExportGraphicBlock, ExportImageBlock } from '../types';
import { WarningCollector } from '../warnings';
import { PdfFontSet } from './fonts';
import { layoutGalley, type GalleyEnvironment, type TableAtom } from './galley';

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => {
  assets = serveExportAssets();
});
afterEach(() => assets.restore());

async function environment(blocks: ExportBlock[]): Promise<GalleyEnvironment> {
  const warnings = new WarningCollector('pdf');
  const registry = new ExportFontRegistry(warnings);
  noteDocumentFonts(registry, blocks, { generated: true, graphicFallbacks: false });
  await registry.load({ instances: true, fallback: false });
  const fonts = new PdfFontSet(await PDFDocument.create());
  return {
    registry,
    fonts,
    warnings,
    rasterizer: null,
    pageHeight: 1000,
    metricsFor: (context: TextContext) => {
      const base = textBaseStyle(context);
      const resolution = registry.resolve({ family: base.family, weight: base.weight, italic: base.italic });
      return resolution.fonts[0]
        ? fonts.forLoaded(resolution.fonts[0]).metrics
        : fonts.forStandard('Helvetica', base.weight >= 600, base.italic).metrics;
    },
  };
}

const cellTable = (blocks: ExportBlock[]): ExportBlock => ({
  type: 'table',
  rows: [{ cells: [{ header: false, colSpan: 1, rowSpan: 1, blocks }] }],
});

const rowHeight = (env: GalleyEnvironment, blocks: ExportBlock[]) => {
  const galley = layoutGalley(env, [cellTable(blocks)], 600);
  const row = galley.atoms.find((atom): atom is TableAtom => atom.kind === 'table');
  return row?.height ?? 0;
};

describe('layoutGalley', () => {
  it('trims a failed image placeholder to the cell edges like the text it stands for', async () => {
    const image: ExportImageBlock = { type: 'image', src: 'https://example.com/missing.png', alt: 'Chart' };
    const placeholderText: ExportBlock = { type: 'paragraph', runs: imagePlaceholderRuns(image), align: 'center' };
    const env = await environment([placeholderText]);
    // Alone in the cell, then first and last of two blocks.
    expect(rowHeight(env, [image])).toBeCloseTo(rowHeight(env, [placeholderText]), 3);
    const follow: ExportBlock = { type: 'paragraph', runs: [{ text: 'After', marks: {} }] };
    expect(rowHeight(env, [image, follow])).toBeCloseTo(rowHeight(env, [placeholderText, follow]), 3);
    expect(rowHeight(env, [follow, image])).toBeCloseTo(rowHeight(env, [follow, placeholderText]), 3);
  });

  it("sets a graphic's text fallback in the graphic's place, trimmed at the cell edges", async () => {
    const timeline = updateGraphicTitle(createStarterGraphic('timeline-vertical'), 'Roadmap');
    const html = `<div data-lwrite-graphic='${serializeSmartGraphic(timeline)}'></div>`;
    const [graphic] = extractExportDocumentFromHtml({ html, name: 'G', locale: 'en' }).blocks as [ExportGraphicBlock];
    const text = graphicToFallbackBlocks(graphic);
    const env = await environment(text);
    // Alone in a cell: no space above the title or below the last item.
    expect(rowHeight(env, [graphic])).toBeCloseTo(rowHeight(env, text), 3);
    // Next to a paragraph the graphic's 24px margin separates them, not the
    // 17.5px between two paragraphs (the cell chrome cancels out).
    const paragraph: ExportBlock = { type: 'paragraph', runs: [{ text: 'Text', marks: {} }] };
    const apart = (a: ExportBlock, b: ExportBlock) => rowHeight(env, [a, b]) - rowHeight(env, [a]) - rowHeight(env, [b]);
    const extra = DOCUMENT_STYLE.graphic.margin - DOCUMENT_STYLE.table.paragraphMarginTop;
    expect(apart(paragraph, graphic) - apart(paragraph, paragraph)).toBeCloseTo(extra, 3);
    expect(apart(graphic, paragraph) - apart(paragraph, paragraph)).toBeCloseTo(extra, 3);
  });
});
