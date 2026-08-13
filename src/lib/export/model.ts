import type {
  ExportAlignment,
  ExportBlock,
  ExportDocumentModel,
  ExportImageBlock,
  ExportInlineMarks,
  ExportInlineRun,
  ExportLink,
  ExportListBlock,
  ExportTableBlock,
  ExportTableCell,
  ExportTextBlock,
} from './types';
import { hasVisibleText, normalizeFontFamilyValue, normalizeRuns } from './shared';
import type { Locale } from '@/lib/translations';

interface ModelOptions {
  html: string;
  name: string;
  locale: Locale;
}

const BLOCK_TAGS = new Set([
  'blockquote',
  'div',
  'h1',
  'h2',
  'h3',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  'table',
  'ul',
]);

export function extractExportDocumentFromHtml({ html, name, locale }: ModelOptions): ExportDocumentModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks = parseChildrenAsBlocks(doc.body);
  return {
    html,
    name,
    locale,
    blocks: blocks.length ? blocks : [{ type: 'paragraph', runs: [{ text: '', marks: {} }] }],
  };
}

function parseChildrenAsBlocks(parent: ParentNode): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  let inlineRuns: ExportInlineRun[] = [];

  const flushInline = () => {
    const normalized = normalizeRuns(inlineRuns);
    inlineRuns = [];
    if (!hasVisibleText(normalized)) return;
    blocks.push({ type: 'paragraph', runs: normalized });
  };

  parent.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineRuns.push({ text: child.textContent ?? '', marks: {} });
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const element = child as HTMLElement;
    if (isBlockElement(element)) {
      flushInline();
      blocks.push(...parseElementAsBlocks(element));
      return;
    }

    collectInlineRuns(element, {}, undefined, inlineRuns);
  });

  flushInline();
  return blocks;
}

function parseElementAsBlocks(element: HTMLElement): ExportBlock[] {
  if (element.hasAttribute('data-smart-diagram')) {
    return [parseLegacySmartDiagram(element)];
  }

  const tag = element.tagName.toLowerCase();
  if (tag === 'p') {
    return parseParagraphElement(element, 'paragraph');
  }
  if (tag === 'pre') {
    const runs: ExportInlineRun[] = [];
    collectInlineRuns(element, { fontFamily: 'Courier New' }, undefined, runs);
    return [{ type: 'paragraph', runs: normalizeRuns(runs) }];
  }
  if (tag === 'div') {
    return parseChildrenAsBlocks(element);
  }
  if (tag === 'blockquote') {
    return parseParagraphElement(element, 'blockquote');
  }
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
    const runs: ExportInlineRun[] = [];
    collectInlineRuns(element, getInlineMarksFromElement(element), undefined, runs);
    return [
      {
        type: 'heading',
        level: Number(tag.slice(1)) as 1 | 2 | 3,
        align: getAlignment(element),
        runs: normalizeRuns(runs),
      },
    ];
  }
  if (tag === 'ul' || tag === 'ol') {
    return [parseList(element as HTMLOListElement | HTMLUListElement)];
  }
  if (tag === 'li') {
    return parseChildrenAsBlocks(element);
  }
  if (tag === 'hr') {
    return [{ type: 'horizontal-rule' }];
  }
  if (tag === 'img') {
    return [parseImage(element as HTMLImageElement)];
  }
  if (tag === 'table') {
    return [parseTable(element as HTMLTableElement)];
  }

  return parseChildrenAsBlocks(element);
}

function parseParagraphElement(element: HTMLElement, type: ExportTextBlock['type']): ExportBlock[] {
  const align = getAlignment(element);
  const blocks: ExportBlock[] = [];
  let runs: ExportInlineRun[] = [];

  const flushRuns = () => {
    const normalized = normalizeRuns(runs);
    runs = [];
    if (!hasVisibleText(normalized)) return;
    blocks.push({ type, align, runs: normalized });
  };

  element.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName.toLowerCase() === 'img') {
      flushRuns();
      blocks.push(parseImage(child as HTMLImageElement));
      return;
    }
    collectInlineRuns(child, getInlineMarksFromElement(element), undefined, runs);
  });

  flushRuns();
  return blocks.length ? blocks : [{ type, align, runs: [{ text: '', marks: {} }] }];
}

function parseList(element: HTMLOListElement | HTMLUListElement): ExportListBlock {
  const ordered = element.tagName.toLowerCase() === 'ol';
  const rawStart = ordered ? Number.parseInt(element.getAttribute('start') ?? '1', 10) : 1;
  const start = Number.isFinite(rawStart) && rawStart > 0 ? rawStart : 1;
  const items = Array.from(element.children)
    .filter((child): child is HTMLLIElement => child.tagName.toLowerCase() === 'li')
    .map((item) => {
      const blocks = parseChildrenAsBlocks(item);
      return {
        blocks: blocks.length ? blocks : [{ type: 'paragraph' as const, runs: [{ text: '', marks: {} }] }],
      };
    });
  return { type: 'list', ordered, start, items };
}

function parseTable(table: HTMLTableElement): ExportTableBlock {
  const sectionRows = [
    ...Array.from(table.tHead?.rows ?? []),
    ...Array.from(table.tBodies).flatMap((body) => Array.from(body.rows)),
    ...Array.from(table.tFoot?.rows ?? []),
  ];
  const rows = (sectionRows.length ? sectionRows : Array.from(table.rows)).map((row) => ({
    cells: Array.from(row.children)
      .filter((cell): cell is HTMLTableCellElement => cell.tagName === 'TD' || cell.tagName === 'TH')
      .map((cell): ExportTableCell => {
        const blocks = parseChildrenAsBlocks(cell);
        return {
          header: cell.tagName === 'TH',
          colSpan: Math.max(1, cell.colSpan || 1),
          rowSpan: Math.max(1, cell.rowSpan || 1),
          blocks: blocks.length ? blocks : [{ type: 'paragraph', runs: [{ text: '', marks: {} }] }],
        };
      }),
  }));
  return { type: 'table', rows: rows.filter((row) => row.cells.length) };
}

function parseImage(img: HTMLImageElement): ExportImageBlock {
  const widthValue = img.getAttribute('data-width') ?? img.style.width;
  const widthPercent = parseWidthPercent(widthValue);
  return {
    type: 'image',
    src: img.getAttribute('src') ?? '',
    alt: img.getAttribute('alt') ?? 'Image',
    widthPercent,
    align: getAlignment(img) ?? normalizeAlignment(img.getAttribute('data-align')),
  };
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
    runs.push({ text: node.textContent ?? '', marks: inheritedMarks, link: inheritedLink });
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

  const marks = mergeMarks(inheritedMarks, getInlineMarksFromElement(element));
  const link =
    tag === 'a'
      ? {
          href: element.getAttribute('href') ?? '',
          title: element.getAttribute('title') ?? undefined,
        }
      : inheritedLink;

  element.childNodes.forEach((child) => collectInlineRuns(child, marks, link?.href ? link : undefined, runs));
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
  if (tag === 'code') marks.fontFamily = 'Courier New';
  if (tag === 'mark') marks.highlight = css.backgroundColor || '#FEF08A';

  const weight = Number.parseInt(css.fontWeight, 10);
  if (Number.isFinite(weight) && weight >= 600) marks.bold = true;
  if (css.fontStyle === 'italic') marks.italic = true;
  if (css.textDecoration.includes('underline')) marks.underline = true;
  if (css.textDecoration.includes('line-through')) marks.strike = true;
  if (css.color) marks.color = css.color;
  if (css.backgroundColor) marks.highlight = css.backgroundColor;
  if (css.fontFamily) marks.fontFamily = normalizeFontFamilyValue(css.fontFamily);
  if (css.fontSize) marks.fontSize = css.fontSize;

  return marks;
}

function mergeMarks(base: ExportInlineMarks, override: ExportInlineMarks): ExportInlineMarks {
  return {
    bold: base.bold || override.bold,
    italic: base.italic || override.italic,
    underline: base.underline || override.underline,
    strike: base.strike || override.strike,
    subscript: base.subscript || override.subscript,
    superscript: base.superscript || override.superscript,
    color: override.color ?? base.color,
    highlight: override.highlight ?? base.highlight,
    fontFamily: override.fontFamily ?? base.fontFamily,
    fontSize: override.fontSize ?? base.fontSize,
  };
}

function isBlockElement(element: HTMLElement): boolean {
  return BLOCK_TAGS.has(element.tagName.toLowerCase()) || element.hasAttribute('data-smart-diagram');
}

function getAlignment(element: HTMLElement): ExportAlignment | undefined {
  return (
    normalizeAlignment(element.style.textAlign) ??
    normalizeAlignment(element.getAttribute('align')) ??
    normalizeAlignment(element.getAttribute('data-align'))
  );
}

function normalizeAlignment(value?: string | null): ExportAlignment | undefined {
  if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
    return value;
  }
  return undefined;
}

function parseWidthPercent(value?: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.max(1, Math.min(100, numeric));
}
