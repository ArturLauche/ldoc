import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveExportAssets } from '@/test/exportAssets';
import { createStarterGraphic, serializeSmartGraphic, updateGraphicTitle } from '@/lib/smartGraphic';
import { noteDocumentFonts } from '@/lib/export/textUsage';
import { ExportFontRegistry } from '@/lib/export/fonts/registry';
import { graphicToFallbackBlocks } from '@/lib/export/shared';
import { flowLeaves, textBaseStyle, type TextContext } from '@/lib/export/typography';
import type { ExportBlock, ExportGraphicBlock } from '@/lib/export/types';
import { WarningCollector } from '@/lib/export/warnings';
import { PdfFontSet } from '@/lib/export/pdf/fonts';
import { layoutGalley, type GalleyEnvironment, type TableAtom } from '@/lib/export/pdf/galley';
import { extractExportDocumentFromHtml } from '@/lib/export/model';

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => {
  assets = serveExportAssets();
});
afterEach(() => assets.restore());

async function environment(blocks: ExportBlock[]): Promise<GalleyEnvironment> {
  const warnings = new WarningCollector('pdf');
  const registry = new ExportFontRegistry(warnings);
  noteDocumentFonts(registry, blocks, { generated: true, graphicFallbacks: true });
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

describe('probe', () => {
  it('graphic fallback first/last in a cell', async () => {
    const model = extractExportDocumentFromHtml({
      html: `<div data-lwrite-graphic='${serializeSmartGraphic(updateGraphicTitle(createStarterGraphic('process-chevron'), 'Plan'))}'></div>`,
    } as never);
    const graphic = model.blocks[0] as ExportGraphicBlock;
    expect(graphic.type).toBe('graphic');
    const fallback = graphicToFallbackBlocks(graphic);
    const env = await environment([graphic, ...fallback]);
    const p: ExportBlock = { type: 'paragraph', runs: [{ text: 'Before', marks: {} }] };
    console.log('PDF alone: graphic', rowHeight(env, [graphic]), 'fallback-as-children', rowHeight(env, fallback));
    console.log('PDF after p: graphic', rowHeight(env, [p, graphic]), 'fallback-as-children', rowHeight(env, [p, ...fallback]));
    console.log('PDF before p: graphic', rowHeight(env, [graphic, p]), 'fallback-as-children', rowHeight(env, [...fallback, p]));
    // Office writers' nested flow: old ('cell') vs new ('blockquote', inCell)
    const oldFlow = flowLeaves(fallback, 'cell');
    const newFlow = flowLeaves(fallback, 'blockquote', true);
    console.log('Office first leaf spaceBefore old', oldFlow.leaves[0].spaceBefore, 'new', newFlow.leaves[0].spaceBefore, 'trailing old', oldFlow.trailing, 'new', newFlow.trailing);
  });
});
