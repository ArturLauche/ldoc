import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import notoRegularUrl from '@/assets/fonts/NotoSans-Regular.ttf?url';
import notoBoldUrl from '@/assets/fonts/NotoSans-Bold.ttf?url';
import notoItalicUrl from '@/assets/fonts/NotoSans-Italic.ttf?url';
import notoBoldItalicUrl from '@/assets/fonts/NotoSans-BoldItalic.ttf?url';
import type {
  ExportAlignment,
  ExportBlock,
  ExportDocumentModel,
  ExportImageBlock,
  ExportInlineMarks,
  ExportInlineRun,
  ExportListBlock,
} from './types';
import { imagePlaceholderRuns, normalizeColorToHex, normalizeRuns, resolvePtFromCssSize } from './shared';
import type { WarningCollector } from './warnings';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  custom: boolean;
}

interface PdfState {
  pdfDoc: PDFDocument;
  fonts: PdfFonts;
  warnings: WarningCollector;
  page: PDFPage;
  y: number;
}

interface PdfChunk {
  text: string;
  marks: ExportInlineMarks;
}

interface PdfLine {
  chunks: PdfChunk[];
  width: number;
  height: number;
  baseSize: number;
}

export async function renderPdf(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const fonts = await loadPdfFonts(pdfDoc, warnings);
  const state: PdfState = {
    pdfDoc,
    fonts,
    warnings,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  for (const block of documentModel.blocks) {
    await drawBlock(state, block, 0);
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

export function layoutPdfRuns(
  runs: ExportInlineRun[],
  fonts: PdfFonts,
  warnings: WarningCollector,
  maxWidth = CONTENT_WIDTH,
  baseSize = 12,
): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfChunk[] = [];
  let currentWidth = 0;
  let currentHeight = baseSize * 1.35;

  const flush = () => {
    lines.push({
      chunks: current.length ? current : [{ text: '', marks: {} }],
      width: currentWidth,
      height: currentHeight,
      baseSize,
    });
    current = [];
    currentWidth = 0;
    currentHeight = baseSize * 1.35;
  };

  for (const run of expandVisibleLinks(normalizeRuns(runs))) {
    const pieces = run.text.split('\n');
    pieces.forEach((piece, pieceIndex) => {
      const tokens = piece.split(/(\s+)/).filter((token) => token.length);
      tokens.forEach((token) => {
        const chunks = splitOversizedToken(token, run.marks, fonts, warnings, maxWidth, baseSize);
        chunks.forEach((chunk) => {
          const size = resolvePdfSize(chunk.marks, baseSize);
          const width = textWidth(chunk.text, chunk.marks, fonts, warnings, size);
          if (current.length && currentWidth + width > maxWidth) {
            flush();
          }
          current.push(chunk);
          currentWidth += width;
          currentHeight = Math.max(currentHeight, size * 1.35);
        });
      });
      if (pieceIndex < pieces.length - 1) flush();
    });
  }

  if (current.length || !lines.length) flush();
  return lines;
}

async function loadPdfFonts(pdfDoc: PDFDocument, warnings: WarningCollector): Promise<PdfFonts> {
  try {
    pdfDoc.registerFontkit(fontkit as Parameters<PDFDocument['registerFontkit']>[0]);
    const [regular, bold, italic, boldItalic] = await Promise.all([
      fetchFontBytes(notoRegularUrl),
      fetchFontBytes(notoBoldUrl),
      fetchFontBytes(notoItalicUrl),
      fetchFontBytes(notoBoldItalicUrl),
    ]);
    return {
      regular: await pdfDoc.embedFont(regular, { subset: true }),
      bold: await pdfDoc.embedFont(bold, { subset: true }),
      italic: await pdfDoc.embedFont(italic, { subset: true }),
      boldItalic: await pdfDoc.embedFont(boldItalic, { subset: true }),
      custom: true,
    };
  } catch {
    warnings.add('pdf-font-fallback');
    return {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      custom: false,
    };
  }
}

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  if (typeof fetch !== 'function') throw new Error('Fetch unavailable');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font load failed: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function drawBlock(state: PdfState, block: ExportBlock, depth: number): Promise<void> {
  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') {
    drawParagraph(state, block.runs, {
      align: block.align,
      baseSize: block.type === 'heading' ? headingSize(block.level ?? 1) : 12,
      indent: block.type === 'blockquote' ? 18 : depth * 18,
    });
    state.y -= 6;
    return;
  }
  if (block.type === 'horizontal-rule') {
    ensureSpace(state, 18);
    state.page.drawLine({
      start: { x: MARGIN, y: state.y - 6 },
      end: { x: PAGE_WIDTH - MARGIN, y: state.y - 6 },
      thickness: 0.75,
      color: rgb(0.65, 0.65, 0.65),
    });
    state.y -= 18;
    return;
  }
  if (block.type === 'image') {
    await drawImage(state, block);
    state.y -= 8;
    return;
  }
  if (block.type === 'smart-diagram') {
    state.warnings.add('smart-diagram-as-placeholder', block.title);
    drawParagraph(state, diagramRuns(block.title, block.template, block.items), { baseSize: 12, indent: depth * 18 });
    state.y -= 6;
    return;
  }
  if (block.type === 'table') {
    drawTable(state, block);
    state.y -= 8;
    return;
  }
  if (block.type === 'list') {
    await drawList(state, block, depth);
  }
}

async function drawList(state: PdfState, list: ExportListBlock, depth: number): Promise<void> {
  for (let index = 0; index < list.items.length; index += 1) {
    const marker = list.ordered ? `${list.start + index}. ` : '- ';
    const [first, ...rest] = list.items[index].blocks;
    if (first && (first.type === 'paragraph' || first.type === 'heading' || first.type === 'blockquote')) {
      drawParagraph(state, [{ text: marker, marks: {} }, ...first.runs], { baseSize: 12, indent: depth * 18 });
    } else {
      drawParagraph(state, [{ text: marker, marks: {} }], { baseSize: 12, indent: depth * 18 });
      if (first) await drawBlock(state, first, depth + 1);
    }
    for (const block of rest) {
      await drawBlock(state, block, depth + 1);
    }
  }
}

function drawParagraph(
  state: PdfState,
  runs: ExportInlineRun[],
  options: { align?: ExportAlignment; baseSize?: number; indent?: number },
): void {
  const baseSize = options.baseSize ?? 12;
  const indent = options.indent ?? 0;
  const maxWidth = CONTENT_WIDTH - indent;
  const lines = layoutPdfRuns(runs, state.fonts, state.warnings, maxWidth, baseSize);
  lines.forEach((line) => {
    ensureSpace(state, line.height);
    const x = resolveAlignedX(line.width, options.align, indent);
    drawLine(state, line, x, state.y - baseSize);
    state.y -= line.height;
  });
}

function drawLine(state: PdfState, line: PdfLine, x: number, y: number): void {
  let cursor = x;
  line.chunks.forEach((chunk) => {
    const size = resolvePdfSize(chunk.marks, line.baseSize);
    const font = selectFont(state.fonts, chunk.marks);
    const text = sanitizePdfText(chunk.text, state.fonts, state.warnings);
    const width = textWidth(text, chunk.marks, state.fonts, state.warnings, size);
    const color = rgbFromCss(chunk.marks.color) ?? rgb(0.07, 0.09, 0.15);
    const baseline = chunk.marks.superscript ? y + size * 0.35 : chunk.marks.subscript ? y - size * 0.25 : y;
    const highlight = rgbFromCss(chunk.marks.highlight);
    if (highlight && text.trim()) {
      state.page.drawRectangle({
        x: cursor,
        y: baseline - size * 0.2,
        width,
        height: size * 1.05,
        color: highlight,
        opacity: 0.45,
      });
    }
    try {
      state.page.drawText(text, { x: cursor, y: baseline, size, font, color });
    } catch {
      state.warnings.add('pdf-glyph-missing', text);
      state.page.drawText(replaceNonAscii(text), { x: cursor, y: baseline, size, font, color });
    }
    if (chunk.marks.underline && text.trim()) {
      state.page.drawLine({
        start: { x: cursor, y: baseline - 1.5 },
        end: { x: cursor + width, y: baseline - 1.5 },
        thickness: 0.5,
        color,
      });
    }
    if (chunk.marks.strike && text.trim()) {
      state.page.drawLine({
        start: { x: cursor, y: baseline + size * 0.32 },
        end: { x: cursor + width, y: baseline + size * 0.32 },
        thickness: 0.5,
        color,
      });
    }
    cursor += width;
  });
}

async function drawImage(state: PdfState, image: ExportImageBlock): Promise<void> {
  if (!image.prepared) {
    drawParagraph(state, imagePlaceholderRuns(image), { baseSize: 12, align: image.align });
    return;
  }

  try {
    const embedded =
      image.prepared.mimeType === 'image/png'
        ? await state.pdfDoc.embedPng(image.prepared.bytes)
        : await state.pdfDoc.embedJpg(image.prepared.bytes);
    const displayWidth = Math.min(resolveDisplayWidth(image), CONTENT_WIDTH);
    const displayHeight = (displayWidth / image.prepared.width) * image.prepared.height;
    ensureSpace(state, displayHeight);
    const x = resolveAlignedX(displayWidth, image.align, 0);
    state.page.drawImage(embedded, {
      x,
      y: state.y - displayHeight,
      width: displayWidth,
      height: displayHeight,
    });
    state.y -= displayHeight;
  } catch {
    state.warnings.add('image-decode-failed', image.alt);
    drawParagraph(state, imagePlaceholderRuns(image), { baseSize: 12, align: image.align });
  }
}

function drawTable(state: PdfState, table: Extract<ExportBlock, { type: 'table' }>): void {
  state.warnings.add('table-layout-simplified');
  const maxCols = Math.max(...table.rows.map((row) => row.cells.length), 1);
  const cellWidth = CONTENT_WIDTH / maxCols;
  table.rows.forEach((row) => {
    const cellTexts = row.cells.map((cell) =>
      cell.blocks
        .map((block) => {
          if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') {
            return block.runs.map((run) => run.text).join('');
          }
          return '';
        })
        .join(' ')
        .trim(),
    );
    const cellLines = cellTexts.map((text) =>
      layoutPdfRuns([{ text: text || ' ', marks: {} }], state.fonts, state.warnings, cellWidth - 8, 10),
    );
    const height = Math.max(...cellLines.map((lines) => lines.length * 13 + 8), 24);
    ensureSpace(state, height);
    let x = MARGIN;
    row.cells.forEach((cell, index) => {
      state.page.drawRectangle({
        x,
        y: state.y - height,
        width: cellWidth * cell.colSpan,
        height,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.5,
        color: cell.header ? rgb(0.95, 0.96, 0.98) : undefined,
      });
      const lines = cellLines[index];
      let y = state.y - 16;
      lines.forEach((line) => {
        drawLine(state, line, x + 4, y);
        y -= line.height;
      });
      x += cellWidth * cell.colSpan;
    });
    state.y -= height;
  });
}

function ensureSpace(state: PdfState, height: number): void {
  if (state.y - height >= MARGIN) return;
  state.page = state.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  state.y = PAGE_HEIGHT - MARGIN;
}

function resolveAlignedX(width: number, align?: ExportAlignment, indent = 0): number {
  const left = MARGIN + indent;
  const available = CONTENT_WIDTH - indent;
  if (align === 'center') return left + (available - width) / 2;
  if (align === 'right') return left + available - width;
  return left;
}

function expandVisibleLinks(runs: ExportInlineRun[]): ExportInlineRun[] {
  return runs.flatMap((run) => {
    if (!run.link?.href || run.text.trim() === run.link.href.trim()) return [run];
    return [
      run,
      {
        text: ` (${run.link.href})`,
        marks: { ...run.marks, underline: true, color: run.marks.color ?? '#0563C1' },
      },
    ];
  });
}

function splitOversizedToken(
  token: string,
  marks: ExportInlineMarks,
  fonts: PdfFonts,
  warnings: WarningCollector,
  maxWidth: number,
  baseSize: number,
): PdfChunk[] {
  const size = resolvePdfSize(marks, baseSize);
  if (textWidth(token, marks, fonts, warnings, size) <= maxWidth) return [{ text: token, marks }];
  const chunks: PdfChunk[] = [];
  let current = '';
  for (const char of token) {
    if (current && textWidth(`${current}${char}`, marks, fonts, warnings, size) > maxWidth) {
      chunks.push({ text: current, marks });
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push({ text: current, marks });
  return chunks;
}

function textWidth(text: string, marks: ExportInlineMarks, fonts: PdfFonts, warnings: WarningCollector, size: number): number {
  const font = selectFont(fonts, marks);
  return font.widthOfTextAtSize(sanitizePdfText(text, fonts, warnings), size);
}

function sanitizePdfText(text: string, fonts: PdfFonts, warnings: WarningCollector): string {
  if (fonts.custom) return text;
  if (!/[^\x20-\x7E]/.test(text)) return text;
  warnings.add('pdf-glyph-missing', text);
  return replaceNonAscii(text);
}

function replaceNonAscii(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '?');
}

function selectFont(fonts: PdfFonts, marks: ExportInlineMarks): PDFFont {
  if (marks.bold && marks.italic) return fonts.boldItalic;
  if (marks.bold) return fonts.bold;
  if (marks.italic) return fonts.italic;
  return fonts.regular;
}

function resolvePdfSize(marks: ExportInlineMarks, fallback: number): number {
  const size = resolvePtFromCssSize(marks.fontSize) ?? fallback;
  const scriptScale = marks.subscript || marks.superscript ? 0.72 : 1;
  return Math.max(6, Math.min(48, size * scriptScale));
}

function rgbFromCss(color?: string): RGB | undefined {
  const hex = normalizeColorToHex(color);
  if (!hex) return undefined;
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  );
}

function headingSize(level: number): number {
  if (level === 1) return 22;
  if (level === 2) return 17;
  return 14;
}

function diagramRuns(title: string, template: string, items: string[]): ExportInlineRun[] {
  return [
    { text: `${title} (${template})`, marks: { bold: true } },
    { text: items.length ? `: ${items.join(' -> ')}` : '', marks: {} },
  ];
}

function resolveDisplayWidth(image: ExportImageBlock): number {
  if (!image.prepared) return 1;
  const percent = image.widthPercent ?? 100;
  return Math.max(1, Math.min(image.prepared.width, Math.round((CONTENT_WIDTH * percent) / 100)));
}
