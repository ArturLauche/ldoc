import { isSequentialGraphicLayout } from '@/lib/smartGraphic';
import type {
  ExportBlock,
  ExportGraphicBlock,
  ExportGraphicItem,
  ExportImageBlock,
  ExportInlineMarks,
  ExportInlineRun,
  ExportLink,
  ExportListBlock,
  ExportTableBlock,
  ExportTableCell,
} from './types';

export function escapeXml(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** XML 1.0 forbids most C0 controls and lone surrogates; Office refuses files containing them. */
export function stripInvalidXmlChars(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex -- Removing characters XML cannot carry.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (match) => (match.length === 2 ? match : ''));
}

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXmlAttr(value: string): string {
  return escapeXml(value).replace(/\r?\n/g, ' ');
}

export function getVisibleTextFromRuns(runs: ExportInlineRun[], includeLinks = false): string {
  return normalizeRuns(runs)
    .map((run) => {
      if (!includeLinks || !run.link?.href || run.text.trim() === run.link.href.trim()) {
        return run.text;
      }
      return `${run.text} (${run.link.href})`;
    })
    .join('');
}

const MARK_KEYS: Array<keyof ExportInlineMarks> = [
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
  'code',
  'color',
  'highlight',
  'fontFamily',
  'fontSize',
  'lineHeight',
];

export function sameMarks(a: ExportInlineMarks, b: ExportInlineMarks): boolean {
  return MARK_KEYS.every((key) => (a[key] ?? false) === (b[key] ?? false));
}

export function sameLink(a?: ExportLink, b?: ExportLink): boolean {
  return (a?.href ?? '') === (b?.href ?? '') && (a?.title ?? '') === (b?.title ?? '');
}

export function normalizeRuns(runs: ExportInlineRun[]): ExportInlineRun[] {
  const normalized: ExportInlineRun[] = [];
  runs.forEach((run) => {
    if (!run.text) return;
    const last = normalized.at(-1);
    if (last && sameMarks(last.marks, run.marks) && sameLink(last.link, run.link)) {
      last.text += run.text;
      return;
    }
    normalized.push({
      text: run.text,
      marks: { ...run.marks },
      ...(run.link ? { link: { ...run.link } } : {}),
    });
  });
  return normalized;
}

export function hasVisibleText(runs: ExportInlineRun[]): boolean {
  return runs.some((run) => run.text.replace(/\s+/g, '').length > 0);
}

export function imageLabel(image: ExportImageBlock): string {
  return image.alt.trim() || 'Image';
}

export function imagePlaceholderRuns(image: ExportImageBlock): ExportInlineRun[] {
  return [{ text: `[Image: ${imageLabel(image)}]`, marks: {} }];
}

/** Visits every block, including those inside lists, quotes and table cells. */
export function walkBlocks(blocks: ExportBlock[], visit: (block: ExportBlock) => void): void {
  blocks.forEach((block) => {
    visit(block);
    if (block.type === 'list') {
      block.items.forEach((item) => walkBlocks(item.blocks, visit));
    }
    if (block.type === 'blockquote') {
      walkBlocks(block.blocks, visit);
    }
    if (block.type === 'table') {
      block.rows.forEach((row) => row.cells.forEach((cell) => walkBlocks(cell.blocks, visit)));
    }
  });
}

export function walkRuns(blocks: ExportBlock[], visit: (run: ExportInlineRun) => void): void {
  walkBlocks(blocks, (block) => {
    if (block.type === 'paragraph' || block.type === 'heading') {
      block.runs.forEach(visit);
    }
  });
}

export function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 0xfffffff;
  }
  return hash.toString(16);
}

export function tableHasMergedCells(table: ExportTableBlock): boolean {
  return table.rows.some((row) => row.cells.some((cell) => cell.colSpan > 1 || cell.rowSpan > 1));
}

export interface GridCell {
  cell: ExportTableCell;
  row: number;
  column: number;
  rowSpan: number;
  colSpan: number;
}

export interface TableGrid {
  columnCount: number;
  rowCount: number;
  /** Cells by origin, in row order. */
  cells: GridCell[];
  /** `slots[row][column]` → the cell covering it (origin or merged area). */
  slots: Array<Array<GridCell | undefined>>;
}

/**
 * Lays cells out on the HTML table grid: spans take slots from following rows
 * and columns, and later cells skip occupied slots. Spans are clipped to the
 * table, so a malformed rowspan cannot create phantom rows.
 */
export function buildTableGrid(table: ExportTableBlock): TableGrid {
  const slots: Array<Array<GridCell | undefined>> = table.rows.map(() => []);
  const cells: GridCell[] = [];
  const rowCount = table.rows.length;
  table.rows.forEach((row, rowIndex) => {
    let column = 0;
    row.cells.forEach((cell) => {
      while (slots[rowIndex][column]) column += 1;
      const rowSpan = Math.max(1, Math.min(cell.rowSpan, rowCount - rowIndex));
      const gridCell: GridCell = { cell, row: rowIndex, column, rowSpan, colSpan: Math.max(1, cell.colSpan) };
      cells.push(gridCell);
      for (let r = 0; r < rowSpan; r += 1) {
        for (let c = 0; c < gridCell.colSpan; c += 1) {
          slots[rowIndex + r][column + c] = gridCell;
        }
      }
      column += gridCell.colSpan;
    });
  });
  const columnCount = Math.max(1, ...slots.map((row) => row.length));
  return { columnCount, rowCount, cells, slots };
}

export interface ExpandedTableCell {
  cell: ExportTableCell;
  colSpan: number;
  vMerge?: 'restart' | 'continue';
  column: number;
}

/** Rows of cells per grid row, with vertical-merge continuation entries (WordprocessingML/RTF model). */
export function expandTableGrid(table: ExportTableBlock): { colCount: number; rows: ExpandedTableCell[][] } {
  const grid = buildTableGrid(table);
  const rows = grid.slots.map((slots, rowIndex) => {
    const cells: ExpandedTableCell[] = [];
    for (let column = 0; column < grid.columnCount; ) {
      const occupant = slots[column];
      if (!occupant) {
        column += 1;
        continue;
      }
      if (occupant.column !== column) {
        column += 1;
        continue;
      }
      cells.push({
        cell: occupant.cell,
        colSpan: occupant.colSpan,
        column,
        vMerge: occupant.rowSpan > 1 ? (occupant.row === rowIndex ? 'restart' : 'continue') : undefined,
      });
      column += occupant.colSpan;
    }
    return cells;
  });
  return { colCount: grid.columnCount, rows };
}

/**
 * Column widths in px for a table drawn `availableWidth` wide: the editor's
 * resized columns keep their widths (scaled down when too wide), the rest share
 * what remains, like `table-layout: fixed`.
 */
export function resolveColumnWidths(table: ExportTableBlock, columnCount: number, availableWidth: number, minWidth = 48): number[] {
  const declared = Array.from({ length: columnCount }, (_, index) => table.columnWidths?.[index] ?? null);
  const fixedTotal = declared.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const flexible = declared.filter((width) => width === null).length;
  if (!flexible) {
    const scale = fixedTotal > availableWidth ? availableWidth / fixedTotal : 1;
    return declared.map((width) => (width ?? 0) * scale);
  }
  const remaining = availableWidth - fixedTotal;
  const share = remaining / flexible;
  if (share >= minWidth) return declared.map((width) => width ?? share);
  // Fixed columns leave too little room: scale everything to fit.
  const total = fixedTotal + flexible * minWidth;
  return declared.map((width) => ((width ?? minWidth) * availableWidth) / total);
}

export function graphicToFallbackBlocks(graphic: ExportGraphicBlock): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  if (graphic.title.trim()) {
    blocks.push({
      type: 'heading',
      level: 2,
      runs: [{ text: graphic.title, marks: {} }],
    });
  }
  if (graphic.items.length) {
    blocks.push(graphicItemsToList(graphic.items, isSequentialGraphicLayout(graphic.layoutId)));
  }
  return blocks.length ? blocks : [{ type: 'paragraph', runs: [{ text: '', marks: {} }] }];
}

/** Sequential layouts number their top level; nested details stay bullets, as drawn. */
function graphicItemsToList(items: ExportGraphicItem[], ordered: boolean): ExportListBlock {
  return {
    type: 'list',
    ordered,
    start: 1,
    items: items.map((item) => ({
      blocks: [
        { type: 'paragraph' as const, runs: [{ text: item.label, marks: {} }] },
        ...(item.children.length ? [graphicItemsToList(item.children, false)] : []),
      ],
    })),
  };
}

/** One-line text alternative for a graphic: title, then items in reading order. */
export function graphicAltText(graphic: ExportGraphicBlock): string {
  const labels: string[] = [];
  const visit = (items: ExportGraphicItem[], depth: number) =>
    items.forEach((item) => {
      if (item.label.trim()) labels.push(`${depth ? '– ' : ''}${item.label.trim()}`);
      visit(item.children, depth + 1);
    });
  visit(graphic.items, 0);
  const title = graphic.title.trim();
  return [title, labels.join('; ')].filter(Boolean).join(': ') || 'Smart Graphic';
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function bytesToHex(bytes: Uint8Array): string {
  const digits = '0123456789abcdef';
  const out = new Array<string>(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    out[index] = digits[bytes[index] >> 4] + digits[bytes[index] & 15];
  }
  return out.join('');
}

const LANGUAGE_TAGS: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
  fr: 'fr-FR',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ar: 'ar-SA',
  ru: 'ru-RU',
};

/** BCP 47 tag with region for document metadata (Office and ODF want one). */
export function languageTag(locale: string): string {
  return LANGUAGE_TAGS[locale] ?? locale;
}
