import { PDFDocument, PDFName, PDFNumber, PDFNull, PDFHexString, type PDFImage, type PDFRef } from 'pdf-lib';
import { ExportFontRegistry } from '../fonts/registry';
import { noteSceneFonts } from '../graphics/fonts';
import { walkBlocks } from '../shared';
import { noteDocumentFonts } from '../textUsage';
import { PX_TO_PT, pageGeometry, textBaseStyle, type TextContext } from '../typography';
import type { ExportDocumentModel, PreparedExportImage } from '../types';
import type { WarningCollector } from '../warnings';
import { drawPages, rasterKey, type DrawEnvironment, type OutlineEntry } from './draw';
import { PdfFontSet, type FontMetrics } from './fonts';
import { layoutGalley, type Galley, type GalleyEnvironment } from './galley';
import { paginate } from './paginate';
import { createCanvasGlyphRasterizer } from './rasterGlyphs';
import type { StyledRun } from './inline';

/**
 * PDF export: real fonts (the selected families, instanced at the weights
 * the editor uses and subset-embedded), CSS-equivalent layout, clickable
 * links, vector Smart Graphics and a heading outline. Loaded lazily.
 */
export async function renderPdf(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  const geometry = pageGeometry(documentModel.locale);
  const pageHeight = geometry.contentHeightPt / PX_TO_PT;
  const registry = new ExportFontRegistry(warnings);
  noteDocumentFonts(registry, documentModel.blocks, { generated: true, graphicFallbacks: false });
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'graphic' && block.scene) noteSceneFonts(registry, block.scene);
  });
  await registry.load({ instances: true, fallback: true });

  const document = await PDFDocument.create();
  const fonts = new PdfFontSet(document);
  const images = await embedImages(document, documentModel, warnings);
  const rasterizer = createCanvasGlyphRasterizer();

  const metricsFor = (context: TextContext): FontMetrics => {
    const base = textBaseStyle(context);
    const resolution = registry.resolve({ family: base.family, weight: base.weight, italic: base.italic });
    if (resolution.fonts[0]) return fonts.forLoaded(resolution.fonts[0]).metrics;
    return fonts.forStandard(resolution.standard ?? 'Helvetica', base.weight >= 600, base.italic).metrics;
  };
  const env: GalleyEnvironment = { registry, fonts, warnings, rasterizer, pageHeight, metricsFor };
  const galley = layoutGalley(env, documentModel.blocks, geometry.contentWidthPx);
  const pages = paginate(galley, pageHeight);

  const rasters = new Map<string, PDFImage>();
  if (rasterizer) {
    const missing = new Map<string, StyledRun & { key: string }>();
    collectMissing(galley, missing);
    for (const entry of missing.values()) {
      const bytes = await rasterizer.render(entry.text, entry.style);
      if (bytes) rasters.set(entry.key, await document.embedPng(bytes));
    }
  }

  const drawEnv: DrawEnvironment = { document, geometry, fonts, registry, images, rasters };
  const outline = drawPages(drawEnv, pages);
  fonts.finalize();
  if (outline.length) addOutline(document, outline);

  document.setTitle(documentModel.name || 'Untitled', { showInWindowTitleBar: true });
  document.setLanguage(documentModel.locale);
  document.setCreator('LWrite');
  document.setProducer('LWrite');
  const now = new Date();
  document.setCreationDate(now);
  document.setModificationDate(now);

  const bytes = await document.save({ useObjectStreams: true });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}

/** Embeds each distinct image once; undecodable images fall back to their alt text before layout. */
async function embedImages(
  document: PDFDocument,
  documentModel: ExportDocumentModel,
  warnings: WarningCollector,
): Promise<Map<PreparedExportImage, PDFImage>> {
  const embedded = new Map<PreparedExportImage, PDFImage | null>();
  const blocks: Array<{ prepared?: PreparedExportImage; alt: string }> = [];
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'image' && block.prepared) blocks.push(block);
  });
  for (const block of blocks) {
    const prepared = block.prepared as PreparedExportImage;
    if (!embedded.has(prepared)) {
      try {
        embedded.set(
          prepared,
          prepared.mimeType === 'image/png' ? await document.embedPng(prepared.bytes) : await document.embedJpg(prepared.bytes),
        );
      } catch {
        warnings.add('image-decode-failed', block.alt || 'Image');
        embedded.set(prepared, null);
      }
    }
    if (!embedded.get(prepared)) delete block.prepared;
  }
  const result = new Map<PreparedExportImage, PDFImage>();
  embedded.forEach((image, prepared) => {
    if (image) result.set(prepared, image);
  });
  return result;
}

function collectMissing(galley: Galley, out: Map<string, StyledRun & { key: string }>): void {
  galley.atoms.forEach((atom) => {
    if (atom.kind === 'line') {
      atom.line.pieces.forEach((piece) => {
        if (!piece.missing) return;
        const run = atom.runs[piece.run];
        const key = rasterKey(piece.missing.text, run.style);
        if (!out.has(key)) out.set(key, { text: piece.missing.text, style: run.style, key });
      });
    }
    if (atom.kind === 'table') atom.cells.forEach((cell) => collectMissing(cell.galley, out));
  });
}

/** Bookmarks from h1–h3, nested by level. */
function addOutline(document: PDFDocument, entries: OutlineEntry[]): void {
  const context = document.context;
  interface Node {
    entry: OutlineEntry | null;
    ref: PDFRef;
    children: Node[];
    parent: Node | null;
  }
  const root: Node = { entry: null, ref: context.nextRef(), children: [], parent: null };
  const stack: Node[] = [root];
  entries.forEach((entry) => {
    while (stack.length > 1 && (stack[stack.length - 1].entry?.level ?? 0) >= entry.level) stack.pop();
    const parent = stack[stack.length - 1];
    const node: Node = { entry, ref: context.nextRef(), children: [], parent };
    parent.children.push(node);
    stack.push(node);
  });
  const count = (node: Node): number => node.children.reduce((sum, child) => sum + 1 + count(child), 0);
  const write = (node: Node) => {
    node.children.forEach((child, index) => {
      const entry = child.entry as OutlineEntry;
      const dict = context.obj({
        Title: PDFHexString.fromText(entry.title.slice(0, 200)),
        Parent: node.ref,
        Dest: [entry.page.ref, PDFName.of('XYZ'), PDFNull, PDFNumber.of(Math.round(entry.top + 4)), PDFNull],
      });
      if (index > 0) dict.set(PDFName.of('Prev'), node.children[index - 1].ref);
      if (index < node.children.length - 1) dict.set(PDFName.of('Next'), node.children[index + 1].ref);
      if (child.children.length) {
        dict.set(PDFName.of('First'), child.children[0].ref);
        dict.set(PDFName.of('Last'), child.children[child.children.length - 1].ref);
        dict.set(PDFName.of('Count'), PDFNumber.of(-count(child)));
      }
      context.assign(child.ref, dict);
      write(child);
    });
  };
  write(root);
  context.assign(
    root.ref,
    context.obj({
      Type: 'Outlines',
      First: root.children[0].ref,
      Last: root.children[root.children.length - 1].ref,
      Count: count(root),
    }),
  );
  document.catalog.set(PDFName.of('Outlines'), root.ref);
}
