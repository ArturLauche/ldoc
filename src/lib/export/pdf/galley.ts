import type { GraphicScene } from '../graphics/scene';
import { buildTableGrid, graphicToFallbackBlocks, imagePlaceholderRuns, linkTarget, resolveColumnWidths } from '../shared';
import { styledRuns } from '../textUsage';
import {
  DOCUMENT_STYLE,
  listItemMargins,
  blockMargins,
  textBaseStyle,
  type MarginContext,
  type TextContext,
} from '../typography';
import type {
  ExportAlignment,
  ExportBlock,
  ExportCodeBlock,
  ExportGraphicBlock,
  ExportImageBlock,
  ExportInlineRun,
  ExportListBlock,
  ExportTableBlock,
  ExportTextBlock,
} from '../types';
import type { FontMetrics } from './fonts';
import { layoutInline, type InlineEnvironment, type LayoutLine, type LineSlot, type StyledRun } from './inline';

/**
 * Block layout for PDF. Blocks become a "galley": atoms (line boxes, images,
 * tables, graphics, rules) on one long strip with CSS-collapsed margins.
 * Pagination later cuts the strip into pages; atoms keep the gap before them
 * so a margin at a page top can be dropped, as browsers do when printing.
 */

export type MarkerKind = 'disc' | 'circle' | 'square' | 'number';

export interface ListMarker {
  kind: MarkerKind;
  text: string;
  /** Right edge of the marker box (the list item's start), px. */
  right: number;
  run: StyledRun;
}

interface AtomBase {
  /** Top of the atom on the galley, px. */
  y: number;
  height: number;
  /** Collapsed margin above the atom; dropped at a page top. */
  gapBefore: number;
  /** Padding above the atom inside its container; kept at a page top. */
  insetBefore: number;
  /** Padding below the atom that must stay on the same page. */
  insetAfter: number;
  keepWithNext?: boolean;
}

export interface LineAtom extends AtomBase {
  kind: 'line';
  /** Container content start, px. */
  x: number;
  line: LayoutLine;
  runs: StyledRun[];
  paragraph: { id: number; index: number; count: number };
  marker?: ListMarker;
  heading?: { level: 1 | 2 | 3; text: string };
}

export interface ImageAtom extends AtomBase {
  kind: 'image';
  x: number;
  width: number;
  image: ExportImageBlock;
  marker?: ListMarker;
}

export interface GraphicAtom extends AtomBase {
  kind: 'graphic';
  x: number;
  width: number;
  scene: GraphicScene;
  scale: number;
  alt: string;
  marker?: ListMarker;
}

export interface RuleAtom extends AtomBase {
  kind: 'rule';
  x: number;
  width: number;
}

export interface PlacedCell {
  x: number;
  y: number;
  width: number;
  height: number;
  background?: string;
  header: boolean;
  galley: Galley;
  /** Offset of the content within the cell (after splitting a tall row). */
  contentOffset: number;
}

export interface TableAtom extends AtomBase {
  kind: 'table';
  x: number;
  width: number;
  tableId: number;
  borders: 'visible' | 'hidden';
  cells: PlacedCell[];
  /** Horizontal grid lines (row boundaries) inside the atom, px from its top. */
  rowLines: number[];
  /** Leading rows of header cells, repeated when the table continues on a new page. */
  header?: boolean;
  marker?: ListMarker;
}

export type Atom = LineAtom | ImageAtom | GraphicAtom | RuleAtom | TableAtom;

export interface Decoration {
  kind: 'quote-bar' | 'code-background';
  first: number;
  last: number;
  x: number;
  width: number;
  padTop: number;
  padBottom: number;
  color: string;
  radius: number;
}

export interface Galley {
  atoms: Atom[];
  decorations: Decoration[];
  height: number;
  /** Header atoms by table id, for repetition on new pages. */
  tableHeaders: Map<number, TableAtom[]>;
}

interface FloatBox {
  top: number;
  bottom: number;
  side: 'left' | 'right';
  /** Edge of the float's margin box facing the text, px. */
  edge: number;
}

interface Frame {
  x: number;
  width: number;
  container: MarginContext['container'];
  listDepth: number;
  bulletDepth: number;
  quote: boolean;
  /** Kind of the outermost list when it is a direct child of the document. */
  rootList?: 'ordered' | 'bullet';
  cell?: { header: boolean; color?: string; align?: ExportAlignment };
}

export interface GalleyEnvironment extends InlineEnvironment {
  /** Usable page height, px; tall images and graphics are scaled to fit. */
  pageHeight: number;
  /** Metrics of a style's primary font (line struts). */
  metricsFor(context: TextContext): FontMetrics;
}

let tableCounter = 0;
let paragraphCounter = 0;

class GalleyBuilder {
  readonly atoms: Atom[] = [];
  readonly decorations: Decoration[] = [];
  readonly tableHeaders = new Map<number, TableAtom[]>();
  y = 0;
  pendingTop = 0;
  pendingBottom = 0;
  pendingMarker: ListMarker | undefined;
  floats: FloatBox[] = [];

  constructor(
    readonly env: GalleyEnvironment,
    /** Cells keep their first margin (their padding stops collapsing). */
    readonly keepLeadingMargin: boolean,
  ) {}

  /** Collapses pending margins with `top` and returns the gap before the next box. */
  advance(top: number): number {
    const gap = this.atoms.length || this.keepLeadingMargin ? Math.max(this.pendingBottom, this.pendingTop, top) : Math.max(this.pendingTop, top);
    this.y += gap;
    this.pendingTop = 0;
    this.pendingBottom = 0;
    return gap;
  }

  push<T extends Atom>(atom: T): T {
    if (this.pendingMarker && (atom.kind !== 'rule')) {
      (atom as LineAtom).marker = this.pendingMarker;
      this.pendingMarker = undefined;
    }
    this.atoms.push(atom);
    return atom;
  }

  /** Space beside floats at `y` for a line of `height`. */
  slot(frame: Frame, y: number, height: number): LineSlot {
    let left = frame.x;
    let right = frame.x + frame.width;
    this.floats.forEach((float) => {
      if (float.bottom <= y || float.top >= y + height) return;
      if (float.side === 'left') left = Math.max(left, float.edge);
      else right = Math.min(right, float.edge);
    });
    return { inset: left - frame.x, width: Math.max(0, right - left) };
  }

  floatBottom(y: number): number {
    return this.floats.reduce((bottom, float) => (float.top <= y && float.bottom > y ? Math.max(bottom, float.bottom) : bottom), y);
  }

  finish(): Galley {
    const floatsBottom = this.floats.reduce((bottom, float) => Math.max(bottom, float.bottom), 0);
    return {
      atoms: this.atoms,
      decorations: this.decorations,
      height: Math.max(this.y + (this.keepLeadingMargin ? this.pendingBottom : 0), floatsBottom),
      tableHeaders: this.tableHeaders,
    };
  }
}

export function layoutGalley(env: GalleyEnvironment, blocks: ExportBlock[], width: number): Galley {
  const builder = new GalleyBuilder(env, false);
  layoutBlocks(builder, blocks, { x: 0, width, container: 'root', listDepth: 0, bulletDepth: 0, quote: false });
  return builder.finish();
}

function textContext(frame: Frame, block?: ExportTextBlock): TextContext {
  if (block?.type === 'heading') return { kind: 'heading', level: block.level ?? 1, quote: frame.quote };
  if (frame.cell) {
    return { kind: 'cell', header: frame.cell.header, quote: frame.quote, ...(frame.cell.color ? { color: frame.cell.color } : {}) };
  }
  return { kind: 'body', quote: frame.quote };
}

function layoutBlocks(builder: GalleyBuilder, blocks: ExportBlock[], frame: Frame): void {
  const paragraphIndexes = blocks.map((block, index) => (block.type === 'paragraph' ? index : -1)).filter((index) => index >= 0);
  const firstParagraph = paragraphIndexes[0];
  const lastParagraph = paragraphIndexes[paragraphIndexes.length - 1];
  blocks.forEach((block, index) => {
    const margins = blockMargins(block, {
      container: frame.container,
      index,
      previous: blocks[index - 1],
      listDepth: frame.listDepth,
      ...(frame.rootList ? { rootList: frame.rootList } : {}),
      inCell: Boolean(frame.cell),
    });
    switch (block.type) {
      case 'paragraph':
      case 'heading': {
        // The editor quotes the first and last paragraph of each quote level (prose `p:first-of-type::before`).
        const quotes = frame.quote && block.type === 'paragraph'
          ? { open: index === firstParagraph, close: index === lastParagraph }
          : undefined;
        layoutText(builder, block, frame, margins, quotes);
        break;
      }
      case 'blockquote': {
        builder.pendingTop = Math.max(builder.pendingTop, margins.top);
        const first = builder.atoms.length;
        const inner = DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft;
        layoutBlocks(builder, block.blocks, { ...frame, x: frame.x + inner, width: frame.width - inner, container: 'blockquote', quote: true, rootList: undefined });
        if (builder.atoms.length > first) {
          builder.decorations.push({
            kind: 'quote-bar',
            first,
            last: builder.atoms.length - 1,
            x: frame.x,
            width: DOCUMENT_STYLE.blockquote.borderWidth,
            padTop: 0,
            padBottom: 0,
            color: DOCUMENT_STYLE.borderColor,
            radius: 0,
          });
        }
        builder.pendingBottom = Math.max(builder.pendingBottom, margins.bottom);
        break;
      }
      case 'list':
        layoutList(builder, block, frame, margins);
        break;
      case 'code-block':
        layoutCode(builder, block, frame, margins);
        break;
      case 'table':
        layoutTable(builder, block, frame, margins);
        break;
      case 'image':
        layoutImage(builder, block, frame, margins);
        break;
      case 'graphic':
        layoutGraphic(builder, block, frame, margins);
        break;
      case 'horizontal-rule': {
        const gap = builder.advance(margins.top);
        builder.push({ kind: 'rule', x: frame.x, width: frame.width, y: builder.y, height: DOCUMENT_STYLE.rule.width, gapBefore: gap, insetBefore: 0, insetAfter: 0 });
        builder.y += DOCUMENT_STYLE.rule.width;
        builder.pendingBottom = margins.bottom;
        break;
      }
    }
  });
}

/**
 * The link a PDF can follow: addresses and paths (relative to the PDF, as the
 * spec resolves URI actions), or the start of the document. Other fragments
 * name places the PDF has no destination for.
 */
function pdfLinkHref(builder: GalleyBuilder, href: string): string | undefined {
  const target = linkTarget(href);
  if (target.kind !== 'fragment' || target.top) return href;
  builder.env.warnings.add(
    'link-not-supported-by-format',
    href,
    'A link to a place in the document was kept as text because the PDF has no destination with that name.',
  );
  return undefined;
}

function layoutText(
  builder: GalleyBuilder,
  block: ExportTextBlock,
  frame: Frame,
  margins: { top: number; bottom: number },
  quotes?: { open: boolean; close: boolean },
): void {
  const context = textContext(frame, block);
  const base = textBaseStyle(context);
  const runs: StyledRun[] = styledRuns({ runs: block.runs, context }).map(({ text, style, run }) => {
    const href = run.link?.href ? pdfLinkHref(builder, run.link.href) : undefined;
    return { text, style, ...(href ? { href } : {}) };
  });
  if (quotes?.open || quotes?.close) {
    const quoteStyle = styledRuns({ runs: [{ text: '', marks: {} }], context })[0].style;
    if (quotes.open) runs.unshift({ text: DOCUMENT_STYLE.blockquote.open, style: quoteStyle });
    if (quotes.close) runs.push({ text: DOCUMENT_STYLE.blockquote.close, style: quoteStyle });
  }
  const gap = builder.advance(margins.top);
  const align = block.align ?? frame.cell?.align;
  const top = builder.y;
  let lineTop = top;
  // A full-width float leaves no room beside it: text continues below.
  if (builder.slot(frame, top, 1).width < 60) builder.y = builder.floatBottom(top);
  const lines = layoutInline(builder.env, runs, {
    base,
    baseMetrics: builder.env.metricsFor(context),
    ...(align ? { align } : {}),
    slotAt: (offset, height) => builder.slot(frame, builder.y + offset, height),
  });
  lineTop = builder.y;
  const id = (paragraphCounter += 1);
  const headingText = block.type === 'heading' ? block.runs.map((run) => run.text).join('').trim() : '';
  lines.forEach((line, index) => {
    builder.push({
      kind: 'line',
      x: frame.x,
      line,
      runs,
      y: lineTop,
      height: line.height,
      gapBefore: index === 0 ? gap : 0,
      insetBefore: 0,
      insetAfter: 0,
      paragraph: { id, index, count: lines.length },
      ...(block.type === 'heading' ? { keepWithNext: true } : {}),
      ...(block.type === 'heading' && index === 0 && headingText ? { heading: { level: block.level ?? 1, text: headingText } } : {}),
    });
    lineTop += line.height;
  });
  builder.y = lineTop;
  builder.pendingBottom = margins.bottom;
}

function bulletKind(depth: number): MarkerKind {
  if (depth <= 1) return 'disc';
  if (depth === 2) return 'circle';
  return 'square';
}

function layoutList(builder: GalleyBuilder, list: ExportListBlock, frame: Frame, margins: { top: number; bottom: number }): void {
  builder.pendingTop = Math.max(builder.pendingTop, margins.top);
  const indent = DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding;
  const bulletDepth = list.ordered ? frame.bulletDepth : frame.bulletDepth + 1;
  const rootList = frame.container === 'root' ? (list.ordered ? 'ordered' : 'bullet') : frame.rootList;
  const itemMargins = listItemMargins(Boolean(frame.cell));
  const context = textContext(frame);
  const markerStyle = {
    ...styledRuns({ runs: [{ text: '', marks: {} }], context })[0].style,
    color: DOCUMENT_STYLE.mutedColor,
    weight: 400,
    italic: false,
  };
  list.items.forEach((item, index) => {
    builder.pendingTop = Math.max(builder.pendingTop, itemMargins.top);
    const number = list.start + index;
    builder.pendingMarker = {
      kind: list.ordered ? 'number' : bulletKind(bulletDepth),
      text: list.ordered ? `${number}.` : '',
      right: frame.x + DOCUMENT_STYLE.list.indent,
      run: { text: list.ordered ? `${number}.` : '', style: markerStyle },
    };
    layoutBlocks(builder, item.blocks, {
      ...frame,
      x: frame.x + indent,
      width: frame.width - indent,
      container: 'list-item',
      listDepth: frame.listDepth + 1,
      bulletDepth,
      ...(rootList ? { rootList } : {}),
    });
    builder.pendingMarker = undefined;
    builder.pendingBottom = Math.max(builder.pendingBottom, itemMargins.bottom);
  });
  builder.pendingBottom = Math.max(builder.pendingBottom, margins.bottom);
}

function expandTabs(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let column = 0;
      let result = '';
      for (const char of line) {
        if (char === '\t') {
          const spaces = 8 - (column % 8);
          result += ' '.repeat(spaces);
          column += spaces;
        } else {
          result += char;
          column += 1;
        }
      }
      return result;
    })
    .join('\n');
}

function layoutCode(builder: GalleyBuilder, block: ExportCodeBlock, frame: Frame, margins: { top: number; bottom: number }): void {
  const style = DOCUMENT_STYLE.codeBlock;
  const gap = builder.advance(margins.top);
  const context: TextContext = { kind: 'code-block' };
  const base = textBaseStyle(context);
  const runs: StyledRun[] = styledRuns({ runs: [{ text: expandTabs(block.text) || ' ', marks: {} }], context }).map(({ text, style: runStyle }) => ({
    text,
    style: runStyle,
  }));
  const top = builder.y;
  const contentX = frame.x + style.paddingX;
  const lines = layoutInline(builder.env, runs, {
    base,
    baseMetrics: builder.env.metricsFor(context),
    slotAt: () => ({ inset: 0, width: frame.width - style.paddingX * 2 }),
  });
  const first = builder.atoms.length;
  let lineTop = top + style.paddingY;
  const id = (paragraphCounter += 1);
  lines.forEach((line, index) => {
    builder.push({
      kind: 'line',
      x: contentX,
      line,
      runs,
      y: lineTop,
      height: line.height,
      gapBefore: index === 0 ? gap : 0,
      insetBefore: index === 0 ? style.paddingY : 0,
      insetAfter: index === lines.length - 1 ? style.paddingY : 0,
      paragraph: { id, index, count: lines.length },
    });
    lineTop += line.height;
  });
  builder.decorations.push({
    kind: 'code-background',
    first,
    last: builder.atoms.length - 1,
    x: frame.x,
    width: frame.width,
    padTop: style.paddingY,
    padBottom: style.paddingY,
    color: style.background,
    radius: style.radius,
  });
  builder.y = lineTop + style.paddingY;
  builder.pendingBottom = margins.bottom;
}

/** Display size of an image: % of the column, else natural CSS px, scaled down to fit width and page. */
export function imageDisplaySize(image: ExportImageBlock, available: number, pageHeight: number): { width: number; height: number } {
  if (!image.prepared) return { width: 0, height: 0 };
  let width = image.widthPercent ? (available * image.widthPercent) / 100 : Math.min(image.prepared.width, available);
  width = Math.min(width, available);
  let height = (width / image.prepared.width) * image.prepared.height;
  if (height > pageHeight) {
    width *= pageHeight / height;
    height = pageHeight;
  }
  return { width, height };
}

function layoutImage(builder: GalleyBuilder, image: ExportImageBlock, frame: Frame, margins: { top: number; bottom: number }): void {
  if (!image.prepared) {
    layoutText(builder, { type: 'paragraph', runs: imagePlaceholderRuns(image), align: image.float ? image.float : 'center' }, frame, blockMargins({ type: 'paragraph', runs: [] }, { container: frame.container, index: 1, listDepth: frame.listDepth, ...(frame.rootList ? { rootList: frame.rootList } : {}), inCell: Boolean(frame.cell) }));
    return;
  }
  const { width, height } = imageDisplaySize(image, frame.width, builder.env.pageHeight - DOCUMENT_STYLE.image.margin * 2);
  if (image.float) {
    // Floats do not collapse margins and take the next line position.
    const top = builder.y + builder.pendingBottom + margins.top;
    const x = image.float === 'left' ? frame.x : frame.x + frame.width - width;
    builder.push({ kind: 'image', x, width, image, y: top, height, gapBefore: 0, insetBefore: 0, insetAfter: 0 });
    builder.floats.push({
      top: top - margins.top,
      bottom: top + height + margins.bottom,
      side: image.float,
      edge: image.float === 'left' ? x + width + DOCUMENT_STYLE.image.floatGap : x - DOCUMENT_STYLE.image.floatGap,
    });
    return;
  }
  const gap = builder.advance(margins.top);
  const slot = besideFloats(builder, frame, height);
  const x = frame.x + slot.inset + (slot.width - Math.min(width, slot.width)) / 2;
  const scale = Math.min(1, slot.width / width);
  builder.push({ kind: 'image', x, width: width * scale, image, y: builder.y, height: height * scale, gapBefore: gap, insetBefore: 0, insetAfter: 0 });
  builder.y += height * scale;
  builder.pendingBottom = margins.bottom;
}

/** A box that cannot overlap floats goes beside them, or below when too little room is left. */
function besideFloats(builder: GalleyBuilder, frame: Frame, height: number): LineSlot {
  let slot = builder.slot(frame, builder.y, height);
  if (slot.width < frame.width * 0.4) {
    builder.y = builder.floatBottom(builder.y);
    slot = builder.slot(frame, builder.y, height);
  }
  return slot;
}

const FRAME = DOCUMENT_STYLE.graphic;

function layoutGraphic(builder: GalleyBuilder, graphic: ExportGraphicBlock, frame: Frame, margins: { top: number; bottom: number }): void {
  if (!graphic.scene) {
    builder.env.warnings.add('graphic-layout-simplified');
    layoutBlocks(builder, graphicToFallbackBlocks(graphic), frame);
    return;
  }
  const gap = builder.advance(margins.top);
  const slot = besideFloats(builder, frame, 100);
  const chrome = (FRAME.padding + FRAME.borderWidth) * 2;
  let scale = Math.min(1.25, (slot.width - chrome) / graphic.scene.width);
  const maxHeight = builder.env.pageHeight - margins.top;
  if (graphic.scene.height * scale + chrome > maxHeight) scale = (maxHeight - chrome) / graphic.scene.height;
  const width = slot.width;
  const height = graphic.scene.height * scale + chrome;
  builder.push({
    kind: 'graphic',
    x: frame.x + slot.inset,
    width,
    scene: graphic.scene,
    scale,
    alt: graphic.title,
    y: builder.y,
    height,
    gapBefore: gap,
    insetBefore: 0,
    insetAfter: 0,
  });
  builder.y += height;
  builder.pendingBottom = margins.bottom;
}

function layoutTable(builder: GalleyBuilder, table: ExportTableBlock, frame: Frame, margins: { top: number; bottom: number }): void {
  const style = DOCUMENT_STYLE.table;
  const gap = builder.advance(margins.top);
  const grid = buildTableGrid(table);
  const slot = besideFloats(builder, frame, 100);
  const widths = resolveColumnWidths(table, grid.columnCount, slot.width, style.minColumnWidth);
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const columnX = widths.reduce<number[]>((positions, width, index) => [...positions, positions[index] + width], [0]);
  const tableX = frame.x + slot.inset;
  const tableId = (tableCounter += 1);

  // Lay out each cell's content in its own galley (cells keep their margins).
  const cellLayouts = grid.cells.map((gridCell) => {
    const width = columnX[gridCell.column + gridCell.colSpan] - columnX[gridCell.column];
    const inner = Math.max(8, width - style.cellPaddingX * 2 - style.borderWidth);
    const cellBuilder = new GalleyBuilder(builder.env, true);
    layoutBlocks(cellBuilder, gridCell.cell.blocks, {
      x: 0,
      width: inner,
      container: 'cell',
      listDepth: 0,
      bulletDepth: 0,
      quote: false,
      cell: {
        header: gridCell.cell.header,
        ...(gridCell.cell.color ? { color: gridCell.cell.color } : {}),
        ...(gridCell.cell.align ? { align: gridCell.cell.align } : {}),
      },
    });
    const galley = cellBuilder.finish();
    return { gridCell, width, galley, height: galley.height + style.cellPaddingY * 2 + style.borderWidth };
  });

  // Row heights: tallest single-row cell, then spanning cells stretch their last row.
  const rowHeights = Array.from({ length: grid.rowCount }, () => 0);
  cellLayouts.forEach(({ gridCell, height }) => {
    if (gridCell.rowSpan === 1) rowHeights[gridCell.row] = Math.max(rowHeights[gridCell.row], height);
  });
  cellLayouts.forEach(({ gridCell, height }) => {
    if (gridCell.rowSpan === 1) return;
    const spanned = rowHeights.slice(gridCell.row, gridCell.row + gridCell.rowSpan).reduce((sum, value) => sum + value, 0);
    if (spanned < height) rowHeights[gridCell.row + gridCell.rowSpan - 1] += height - spanned;
  });
  rowHeights.forEach((height, index) => {
    if (!height) rowHeights[index] = textBaseStyle({ kind: 'cell' }).sizePx * 1.75 + style.cellPaddingY * 2;
  });
  const rowY = rowHeights.reduce<number[]>((positions, height, index) => [...positions, positions[index] + height], [0]);

  // Rows joined by a rowspan stay together: one atom per group.
  const groups: Array<{ from: number; to: number }> = [];
  let from = 0;
  let reach = 0;
  for (let row = 0; row < grid.rowCount; row += 1) {
    grid.cells.forEach((cell) => {
      if (cell.row === row) reach = Math.max(reach, row + cell.rowSpan - 1);
    });
    if (reach <= row) {
      groups.push({ from, to: row });
      from = row + 1;
      reach = row + 1;
    }
  }
  const headerRows = (() => {
    let count = 0;
    while (count < grid.rowCount && table.rows[count]?.cells.every((cell) => cell.header)) count += 1;
    return count < grid.rowCount ? count : 0;
  })();

  const headerAtoms: TableAtom[] = [];
  groups.forEach((group, groupIndex) => {
    const top = rowY[group.from];
    const height = rowY[group.to + 1] - top;
    const cells: PlacedCell[] = cellLayouts
      .filter(({ gridCell }) => gridCell.row >= group.from && gridCell.row <= group.to)
      .map(({ gridCell, width, galley }) => {
        const cellTop = rowY[gridCell.row] - top;
        const cellHeight = rowY[gridCell.row + gridCell.rowSpan] - rowY[gridCell.row];
        return {
          x: columnX[gridCell.column],
          y: cellTop,
          width,
          height: cellHeight,
          header: gridCell.cell.header,
          ...(gridCell.cell.backgroundColor ? { background: gridCell.cell.backgroundColor } : {}),
          galley,
          contentOffset: 0,
        };
      });
    const rowLines = rowY.slice(group.from + 1, group.to + 1).map((value) => value - top);
    const atom = builder.push({
      kind: 'table',
      x: tableX,
      width: tableWidth,
      tableId,
      borders: table.borders === 'hidden' ? 'hidden' : 'visible',
      cells,
      rowLines,
      y: builder.y + top,
      height,
      gapBefore: groupIndex === 0 ? gap : 0,
      insetBefore: 0,
      insetAfter: 0,
      ...(group.to < headerRows ? { header: true, keepWithNext: true } : {}),
    });
    if (group.to < headerRows) headerAtoms.push(atom);
  });
  if (headerAtoms.length) builder.tableHeaders.set(tableId, headerAtoms);
  builder.y += rowY[grid.rowCount];
  builder.pendingBottom = margins.bottom;
}

export type { ExportInlineRun };
