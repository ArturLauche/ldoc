import type {
  ExportAlignment,
  ExportBlock,
  ExportDocumentModel,
  ExportGraphicBlock,
  ExportGraphicItem,
  ExportImageBlock,
  ExportInlineMarks,
  ExportInlineRun,
  ExportLink,
  ExportListBlock,
  ExportTableBlock,
  ExportTableCell,
  ExportTextBlock,
} from './types';
import { hasVisibleText, normalizeRuns } from './shared';
import { normalizeLinkUrl } from '@/lib/links';
import { primaryFamilyName } from './fonts/catalog';
import type { Locale } from '@/lib/translations';
import { parseSmartGraphicFromDom, parseSmartGraphicJson } from '@/lib/smartGraphic';
import type { SmartGraphicItem } from '@/lib/smartGraphic';

interface ModelOptions {
  html: string;
  name: string;
  locale: Locale;
}

const BLOCK_TAGS = new Set(['blockquote', 'div', 'h1', 'h2', 'h3', 'hr', 'img', 'li', 'ol', 'p', 'pre', 'table', 'ul']);

// Placeholder for whitespace that came from source line breaks: it is a
// space inside a paragraph but trimmed at paragraph edges (HTML formatting),
// while spaces the author typed are kept. The HTML parser drops U+0000 from
// text, so the placeholder cannot collide with document characters.
const SOFT_SPACE = '\u0000';

/**
 * Builds the format-neutral document model from sanitized editor HTML. This
 * is the only place that interprets document HTML for export.
 */
export function extractExportDocumentFromHtml({ html, name, locale }: ModelOptions): ExportDocumentModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = parseChildrenAsBlocks(doc.body);
  return {
    html,
    name,
    locale,
    blocks: blocks.length ? blocks : [emptyParagraph()],
  };
}

function emptyParagraph(): ExportTextBlock {
  return { type: 'paragraph', runs: [{ text: '', marks: {} }] };
}

function parseChildrenAsBlocks(parent: ParentNode, inherited: ExportInlineMarks = {}): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  let inlineRuns: ExportInlineRun[] = [];

  const flushInline = () => {
    const normalized = finishRuns(inlineRuns);
    inlineRuns = [];
    if (!hasVisibleText(normalized)) return;
    blocks.push({ type: 'paragraph', runs: normalized });
  };

  parent.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineRuns.push({ text: softenWhitespace(child.textContent ?? ''), marks: inherited });
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const element = child as HTMLElement;
    if (isBlockElement(element)) {
      flushInline();
      blocks.push(...parseElementAsBlocks(element, inherited));
      return;
    }

    collectInlineRuns(element, inherited, undefined, inlineRuns);
  });

  flushInline();
  return blocks;
}

function parseElementAsBlocks(element: HTMLElement, inherited: ExportInlineMarks): ExportBlock[] {
  if (element.hasAttribute('data-smart-diagram')) {
    return [parseLegacySmartDiagram(element)];
  }
  if (element.hasAttribute('data-lwrite-graphic')) {
    return [parseGraphic(element)];
  }

  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case 'p':
      return parseParagraphElement(element, 'paragraph', inherited);
    case 'h1':
    case 'h2':
    case 'h3':
      return parseParagraphElement(element, 'heading', inherited, Number(tag.slice(1)) as 1 | 2 | 3);
    case 'pre':
      return [{ type: 'code-block', text: preformattedText(element).replace(/\r\n?/g, '\n').replace(/\n$/, '') }];
    case 'blockquote': {
      const blocks = parseChildrenAsBlocks(element, containerMarks(element, inherited));
      return [{ type: 'blockquote', blocks: blocks.length ? blocks : [emptyParagraph()] }];
    }
    case 'ul':
    case 'ol':
      return [parseList(element as HTMLOListElement | HTMLUListElement, containerMarks(element, inherited))];
    case 'hr':
      return [{ type: 'horizontal-rule' }];
    case 'img':
      return [parseImage(element as HTMLImageElement)];
    case 'table':
      return [parseTable(element as HTMLTableElement, inherited)];
    default:
      return parseChildrenAsBlocks(element, containerMarks(element, inherited));
  }
}

function parseParagraphElement(
  element: HTMLElement,
  type: ExportTextBlock['type'],
  inherited: ExportInlineMarks,
  level?: 1 | 2 | 3,
): ExportBlock[] {
  const align = getAlignment(element);
  const blocks: ExportBlock[] = [];
  let runs: ExportInlineRun[] = [];
  const base = mergeMarks(inherited, getInlineMarksFromElement(element));
  const make = (paragraphRuns: ExportInlineRun[]): ExportTextBlock => ({
    type,
    ...(level ? { level } : {}),
    ...(align ? { align } : {}),
    runs: paragraphRuns,
  });

  const flushRuns = (force = false) => {
    const normalized = finishRuns(runs);
    runs = [];
    if (!force && !hasVisibleText(normalized)) return;
    blocks.push(make(normalized.length ? normalized : [{ text: '', marks: {} }]));
  };

  element.childNodes.forEach((child) => {
    // Imported HTML can put images inside paragraphs; the editor's images are blocks.
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'img') {
      flushRuns();
      blocks.push(parseImage(child as HTMLImageElement));
      return;
    }
    collectInlineRuns(child, base, undefined, runs);
  });

  flushRuns(blocks.length === 0);
  return blocks;
}

function parseList(element: HTMLOListElement | HTMLUListElement, inherited: ExportInlineMarks): ExportListBlock {
  const ordered = element.tagName.toLowerCase() === 'ol';
  const rawStart = ordered ? Number.parseInt(element.getAttribute('start') ?? '1', 10) : 1;
  const start = Number.isFinite(rawStart) && rawStart >= 0 ? rawStart : 1;
  const items = Array.from(element.children)
    .filter((child): child is HTMLLIElement => child.tagName.toLowerCase() === 'li')
    .map((item) => {
      const blocks = parseChildrenAsBlocks(item, containerMarks(item, inherited));
      return { blocks: blocks.length ? blocks : [emptyParagraph()] };
    });
  return { type: 'list', ordered, start, items };
}

function parseTable(table: HTMLTableElement, inherited: ExportInlineMarks): ExportTableBlock {
  const tableMarks = containerMarks(table, inherited);
  const sectionRows = [
    ...Array.from(table.tHead?.rows ?? []),
    ...Array.from(table.tBodies).flatMap((body) => Array.from(body.rows)),
    ...Array.from(table.tFoot?.rows ?? []),
  ];
  const rows = (sectionRows.length ? sectionRows : Array.from(table.rows))
    .map((row) => ({
      cells: Array.from(row.children)
        .filter((cell): cell is HTMLTableCellElement => cell.tagName === 'TD' || cell.tagName === 'TH')
        .map((cell): ExportTableCell => {
          const background = cell.getAttribute('data-background-color') || cell.style.backgroundColor || undefined;
          // Text inherits the cell's styles; a filled cell's color is its contrast ink (below).
          const marks = containerMarks(cell, tableMarks);
          if (background && cell.style.color) delete marks.color;
          const blocks = parseChildrenAsBlocks(cell, marks);
          return {
            header: cell.tagName === 'TH',
            colSpan: clampSpan(cell.colSpan),
            rowSpan: clampSpan(cell.rowSpan),
            ...(background ? { backgroundColor: background } : {}),
            ...(background && cell.style.color ? { color: cell.style.color } : {}),
            ...(getAlignment(cell) ? { align: getAlignment(cell) } : {}),
            blocks: blocks.length ? blocks : [emptyParagraph()],
          };
        }),
    }))
    .filter((row) => row.cells.length);
  const widths = parseColumnWidths(table, rows);
  return {
    type: 'table',
    borders: table.getAttribute('data-borders') === 'hidden' ? 'hidden' : 'visible',
    rows,
    ...(widths.some((width) => width !== null) ? { columnWidths: widths } : {}),
  };
}

function clampSpan(value: number): number {
  return Math.max(1, Math.min(64, Number.isFinite(value) ? Math.floor(value) : 1));
}

/**
 * Column widths as the editor computes them (TipTap `createColGroup`): the
 * first row's `colwidth` attributes, else the `<col>` widths.
 */
function parseColumnWidths(table: HTMLTableElement, rows: Array<{ cells: ExportTableCell[] }>): Array<number | null> {
  const firstRow = table.rows[0];
  const widths: Array<number | null> = [];
  if (firstRow) {
    Array.from(firstRow.children)
      .filter((cell): cell is HTMLTableCellElement => cell.tagName === 'TD' || cell.tagName === 'TH')
      .forEach((cell) => {
        const values = (cell.getAttribute('colwidth') ?? '').split(',').map((value) => Number.parseInt(value, 10));
        for (let index = 0; index < clampSpan(cell.colSpan); index += 1) {
          const width = values[index];
          widths.push(Number.isFinite(width) && width > 0 ? width : null);
        }
      });
  }
  if (!widths.some((width) => width !== null)) {
    const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
    cols.forEach((col, index) => {
      const value = (col as HTMLElement).style.width;
      const width = value.endsWith('px') ? Number.parseFloat(value) : Number.NaN;
      if (index < widths.length || !widths.length) widths[index] = Number.isFinite(width) && width > 0 ? width : null;
    });
  }
  const columnCount = Math.max(widths.length, ...rows.map((row) => row.cells.reduce((sum, cell) => sum + cell.colSpan, 0)));
  while (widths.length < columnCount) widths.push(null);
  return widths.slice(0, columnCount);
}

function parseImage(img: HTMLImageElement): ExportImageBlock {
  const widthValue = img.getAttribute('data-width') ?? (img.style.width.endsWith('%') ? img.style.width : null);
  const widthPercent = parseWidthPercent(widthValue);
  // The editor defaults images to centered blocks; left/right float with text beside them.
  const align = normalizeAlignment(img.getAttribute('data-align')) ?? normalizeAlignment(img.getAttribute('align')) ?? 'center';
  return {
    type: 'image',
    src: img.getAttribute('src') ?? '',
    alt: (img.getAttribute('alt') ?? '').trim(),
    ...(widthPercent ? { widthPercent } : {}),
    align,
    ...(align === 'left' || align === 'right' ? { float: align } : {}),
  };
}

function parseGraphic(element: HTMLElement): ExportBlock {
  const model =
    parseSmartGraphicJson(element.getAttribute('data-lwrite-graphic')) ?? parseSmartGraphicFromDom(element);
  if (!model) {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { type: 'paragraph', runs: [{ text, marks: {} }] };
  }
  return {
    type: 'graphic',
    layoutId: model.layoutId,
    title: model.title,
    items: toExportGraphicItems(model.items),
    model,
  } satisfies ExportGraphicBlock;
}

function toExportGraphicItems(items: SmartGraphicItem[]): ExportGraphicItem[] {
  return items.map((item) => ({
    label: item.label,
    children: toExportGraphicItems(item.children),
  }));
}

function parseLegacySmartDiagram(element: HTMLElement): ExportBlock {
  const title = (element.getAttribute('data-title') ?? '').replace(/\s+/g, ' ').trim();
  const items = (element.getAttribute('data-items') ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  const itemText = items.join(' -> ');
  const fallback = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  const text = title && itemText ? `${title}: ${itemText}` : title || itemText || fallback;
  return {
    type: 'paragraph',
    runs: [{ text, marks: {} }],
  };
}

function collectInlineRuns(
  node: Node,
  inheritedMarks: ExportInlineMarks,
  inheritedLink: ExportLink | undefined,
  runs: ExportInlineRun[],
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    runs.push({ text: softenWhitespace(node.textContent ?? ''), marks: inheritedMarks, link: inheritedLink });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (tag === 'br') {
    runs.push({ text: '\n', marks: inheritedMarks, link: inheritedLink });
    return;
  }
  if (tag === 'img') return;

  let base = inheritedMarks;
  let link = inheritedLink;
  if (tag === 'a') {
    // The editor's own link policy: web and mail addresses, fragments and relative paths.
    const href = (element.getAttribute('href') ?? '').trim();
    if (href && normalizeLinkUrl(href)) {
      link = { href, ...(element.getAttribute('title') ? { title: element.getAttribute('title') as string } : {}) };
      // The link's own color replaces colors set around it, as in the editor.
      base = { ...inheritedMarks, color: undefined };
    }
  }
  const marks = mergeMarks(base, getInlineMarksFromElement(element));
  element.childNodes.forEach((child) => collectInlineRuns(child, marks, link, runs));
}

function getInlineMarksFromElement(element: HTMLElement): ExportInlineMarks {
  const tag = element.tagName.toLowerCase();
  const css = element.style;
  const marks: ExportInlineMarks = {};

  if (tag === 'strong' || tag === 'b') marks.bold = true;
  if (tag === 'em' || tag === 'i') marks.italic = true;
  if (tag === 'u') marks.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') marks.strike = true;
  if (tag === 'sub') marks.subscript = true;
  if (tag === 'sup') marks.superscript = true;
  if (tag === 'code') marks.code = true;
  if (tag === 'mark') {
    marks.highlight = css.backgroundColor || element.getAttribute('data-color') || `#${'FFFF00'}`;
  }

  const weight = css.fontWeight === 'bold' ? 700 : Number.parseInt(css.fontWeight, 10);
  if (Number.isFinite(weight) && weight >= 600) marks.bold = true;
  if (css.fontStyle === 'italic' || css.fontStyle === 'oblique') marks.italic = true;
  const decoration = `${css.textDecoration} ${css.textDecorationLine}`;
  if (decoration.includes('underline')) marks.underline = true;
  if (decoration.includes('line-through')) marks.strike = true;
  if (css.color && tag !== 'mark') marks.color = css.color;
  if (css.backgroundColor && tag !== 'mark') marks.highlight = css.backgroundColor;
  if (css.fontFamily) marks.fontFamily = primaryFamilyName(css.fontFamily);
  if (css.fontSize) marks.fontSize = css.fontSize;
  if (css.lineHeight) marks.lineHeight = css.lineHeight;
  if (css.verticalAlign === 'super') marks.superscript = true;
  if (css.verticalAlign === 'sub') marks.subscript = true;

  return marks;
}

/**
 * Styles a block container (cell, list, quote, div) passes on to its text.
 * Its background fills the box rather than highlighting text, so it is not a mark.
 */
function containerMarks(element: HTMLElement, inherited: ExportInlineMarks): ExportInlineMarks {
  const own = getInlineMarksFromElement(element);
  delete own.highlight;
  return mergeMarks(inherited, own);
}

/** Text of a code block; line breaks may be newlines or `<br>` elements. */
function preformattedText(element: HTMLElement): string {
  let text = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') text += '\n';
    else node.childNodes.forEach(visit);
  };
  element.childNodes.forEach(visit);
  return text;
}

function mergeMarks(base: ExportInlineMarks, override: ExportInlineMarks): ExportInlineMarks {
  const merged: ExportInlineMarks = {
    bold: base.bold || override.bold,
    italic: base.italic || override.italic,
    underline: base.underline || override.underline,
    strike: base.strike || override.strike,
    subscript: base.subscript || override.subscript,
    superscript: base.superscript || override.superscript,
    code: base.code || override.code,
    color: override.color ?? base.color,
    highlight: override.highlight ?? base.highlight,
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontSize: override.fontSize ?? base.fontSize,
    lineHeight: override.lineHeight ?? base.lineHeight,
  };
  (Object.keys(merged) as Array<keyof ExportInlineMarks>).forEach((key) => {
    if (merged[key] === undefined || merged[key] === false) delete merged[key];
  });
  return merged;
}

function softenWhitespace(text: string): string {
  return text.replace(/[ \t]*[\r\n]+[ \t]*/g, SOFT_SPACE).replace(/\t/g, ' ');
}

/** Merges runs and resolves soft (source-formatting) whitespace. */
function finishRuns(runs: ExportInlineRun[]): ExportInlineRun[] {
  const normalized = normalizeRuns(runs);
  if (!normalized.length) return normalized;
  const first = normalized[0];
  first.text = first.text.replace(new RegExp(`^${SOFT_SPACE}+`), '');
  const last = normalized[normalized.length - 1];
  last.text = last.text.replace(new RegExp(`${SOFT_SPACE}+$`), '');
  let previousEndsWithSpace = false;
  normalized.forEach((run) => {
    let text = run.text.replace(new RegExp(`${SOFT_SPACE}+`, 'g'), SOFT_SPACE);
    // A soft space next to a real space or line break collapses into it.
    text = text.replace(new RegExp(`([ \\n])${SOFT_SPACE}|${SOFT_SPACE}(?=[ \\n])`, 'g'), '$1');
    if (previousEndsWithSpace) text = text.replace(new RegExp(`^${SOFT_SPACE}`), '');
    run.text = text.replace(new RegExp(SOFT_SPACE, 'g'), ' ');
    if (run.text) previousEndsWithSpace = /[ \n]$/.test(run.text);
  });
  return normalized.filter((run) => run.text.length > 0);
}

function isBlockElement(element: HTMLElement): boolean {
  return BLOCK_TAGS.has(element.tagName.toLowerCase()) || element.hasAttribute('data-smart-diagram') || element.hasAttribute('data-lwrite-graphic');
}

function getAlignment(element: HTMLElement): ExportAlignment | undefined {
  return (
    normalizeAlignment(element.style.textAlign) ??
    normalizeAlignment(element.getAttribute('align')) ??
    (element.tagName === 'IMG' ? undefined : normalizeAlignment(element.getAttribute('data-align')))
  );
}

function normalizeAlignment(value?: string | null): ExportAlignment | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'start') return 'left';
  if (normalized === 'end') return 'right';
  if (normalized === 'left' || normalized === 'center' || normalized === 'right' || normalized === 'justify') {
    return normalized;
  }
  return undefined;
}

function parseWidthPercent(value?: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.max(1, Math.min(100, numeric));
}
