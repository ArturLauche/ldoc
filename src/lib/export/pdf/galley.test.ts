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

async function environment(blocks: ExportBlock[], direction: 'ltr' | 'rtl' = 'ltr'): Promise<GalleyEnvironment> {
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
    direction,
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
  it("lays out a failed image's placeholder with the image's margins, trimmed at the cell edges", async () => {
    const image: ExportImageBlock = { type: 'image', src: 'https://example.com/missing.png', alt: 'Chart' };
    const placeholderText: ExportBlock = { type: 'paragraph', runs: imagePlaceholderRuns(image), align: 'center' };
    const env = await environment([placeholderText]);
    // Alone in the cell, the placeholder is as tall as its text.
    expect(rowHeight(env, [image])).toBeCloseTo(rowHeight(env, [placeholderText]), 3);
    // After text, the image's 16px margin applies, as in DOCX, ODT and RTF,
    // not the 17.5px of a cell paragraph.
    const other: ExportBlock = { type: 'paragraph', runs: [{ text: 'Text', marks: {} }] };
    expect(rowHeight(env, [other, image]) - rowHeight(env, [other, placeholderText])).toBeCloseTo(
      DOCUMENT_STYLE.image.margin - DOCUMENT_STYLE.table.paragraphMarginTop,
      3,
    );
  });

  it('keeps a graphic upright in a cell narrower than its frame', async () => {
    const graphic: ExportGraphicBlock = {
      type: 'graphic',
      layoutId: 'process-chevron',
      title: 'Narrow',
      items: [],
      scene: { width: 600, height: 200, items: [] },
    };
    const paragraph: ExportBlock = { type: 'paragraph', runs: [{ text: 'x', marks: {} }] };
    const table: ExportBlock = {
      type: 'table',
      rows: [
        {
          cells: Array.from({ length: 20 }, (_, index) => ({
            header: false,
            colSpan: 1,
            rowSpan: 1,
            blocks: index === 0 ? [graphic] : [paragraph],
          })),
        },
      ],
    };
    const env = await environment([table]);
    const galley = layoutGalley(env, [table], 600);
    const tableAtom = galley.atoms.find((atom): atom is TableAtom => atom.kind === 'table');
    const graphicAtom = tableAtom?.cells[0].galley.atoms.find((atom) => atom.kind === 'graphic');
    expect(graphicAtom?.scale).toBeGreaterThan(0);
    expect(graphicAtom?.height).toBeGreaterThan(0);
  });

  it('mirrors list markers, quote bars and table columns for RTL', async () => {
    const paragraph: ExportBlock = { type: 'paragraph', runs: [{ text: 'Item', marks: {} }] };
    const list: ExportBlock = {
      type: 'list',
      ordered: false,
      start: 1,
      items: [{ blocks: [paragraph] }],
    };
    const quote: ExportBlock = { type: 'blockquote', blocks: [paragraph] };
    const table: ExportBlock = {
      type: 'table',
      rows: [
        {
          cells: [
            { header: false, colSpan: 1, rowSpan: 1, blocks: [paragraph] },
            { header: false, colSpan: 1, rowSpan: 1, blocks: [paragraph] },
          ],
        },
      ],
    };
    const env = await environment([list, quote, table], 'rtl');
    const galley = layoutGalley(env, [list, quote, table], 600);

    const line = galley.atoms.find((atom) => atom.kind === 'line');
    expect(line?.marker?.right).toBeCloseTo(600 - DOCUMENT_STYLE.list.indent, 5);

    const bar = galley.decorations.find((decoration) => decoration.kind === 'quote-bar');
    expect(bar?.x).toBeCloseTo(600 - DOCUMENT_STYLE.blockquote.borderWidth, 5);

    const tableAtom = galley.atoms.find((atom): atom is TableAtom => atom.kind === 'table');
    expect(tableAtom?.cells[0].x).toBeGreaterThan(tableAtom?.cells[1].x ?? 0);
  });

  it("sets a graphic's text fallback in the graphic's place, trimmed at the cell edges", async () => {    const timeline = updateGraphicTitle(createStarterGraphic('timeline-vertical'), 'Roadmap');
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
