import type { Locale } from '@/lib/translations';
import { DEFAULT_DOCUMENT_FAMILY, MONOSPACE_FAMILY, resolveFamily, type ResolvedFamily } from './fonts/catalog';
import { toHex } from './color';
import type { ExportBlock, ExportInlineMarks, ExportLink, ExportListBlock } from './types';

/**
 * The editor's document presentation as numbers, so every exporter draws the
 * same document. Values are CSS px measured from the editor (`.prose` from
 * @tailwindcss/typography plus `src/index.css`) in Chromium; 1px = 0.75pt.
 * A browser test compares them with the live editor so they cannot drift.
 */
export const PX_TO_PT = 0.75;

export const DOCUMENT_STYLE = {
  family: DEFAULT_DOCUMENT_FAMILY,
  sizePx: 16,
  lineHeight: 1.75,
  color: '1D2435',
  mutedColor: '5C697A',
  borderColor: 'D2D8E0',
  linkColor: '2E3D52',
  linkWeight: 500,
  strongWeight: 600,
  paragraph: { marginTop: 20, marginBottom: 16 },
  headings: {
    1: { sizePx: 36, weight: 700, strongWeight: 900, lineHeight: 1.2, marginTop: 32, marginBottom: 16 },
    2: { sizePx: 28, weight: 600, strongWeight: 800, lineHeight: 1.3, marginTop: 28, marginBottom: 12 },
    3: { sizePx: 20, weight: 600, strongWeight: 700, lineHeight: 1.4, marginTop: 24, marginBottom: 8 },
  },
  list: {
    /** `ul/ol` padding-inline-start. */
    indent: 24,
    /** `li` padding-inline-start; markers sit outside it. */
    itemPadding: 6,
    marginTop: 20,
    nestedMarginTop: 12,
    marginBottom: 16,
    itemMarginTop: 8,
    itemMarginBottom: 2,
    firstParagraphMarginTop: 20,
    paragraphMarginTop: 12,
  },
  blockquote: { margin: 25.6, paddingLeft: 16, borderWidth: 4, weight: 500, italic: true, open: '“', close: '”' },
  inlineCode: { scale: 0.875, weight: 600, before: '`', after: '`' },
  codeBlock: { sizePx: 14, lineHeightPx: 24, paddingX: 16, paddingY: 12, radius: 6, background: 'FAFBFB', margin: 24 },
  rule: { margin: 48, width: 1 },
  table: {
    sizePx: 14,
    lineHeight: 1.75,
    margin: 12,
    cellPaddingX: 8,
    cellPaddingY: 3.2,
    borderWidth: 1,
    cellBackground: 'F3F5F7',
    headerBackground: 'F1F3F5',
    headerWeight: 600,
    paragraphMarginTop: 17.5,
    paragraphMarginBottom: 16,
    minColumnWidth: 48,
  },
  image: { margin: 16, floatMargin: 8, floatGap: 24, radius: 8 },
  graphic: { margin: 24, padding: 20, radius: 12, borderColor: 'DBE0E6', background: 'FFFFFF', borderWidth: 1 },
  mark: { paddingX: 4, paddingY: 2, radius: 4, defaultColor: 'FFFF00' },
  script: { scale: 0.75, superShift: 0.5, subShift: 0.25 },
} as const;

/** Text column of the editor on a desktop screen (max-w-4xl minus page padding). */
export const EDITOR_COLUMN_WIDTH = 734;

export type HeadingLevel = 1 | 2 | 3;

export interface PageGeometry {
  name: 'letter' | 'a4';
  widthPt: number;
  heightPt: number;
  marginPt: number;
  contentWidthPt: number;
  contentHeightPt: number;
  contentWidthPx: number;
}

/** US Letter for English, A4 elsewhere; margins of 1in / 25mm. */
export function pageGeometry(locale: Locale): PageGeometry {
  const letter = locale === 'en';
  const widthPt = letter ? 612 : 595.28;
  const heightPt = letter ? 792 : 841.89;
  const marginPt = letter ? 72 : 70.87;
  const contentWidthPt = widthPt - marginPt * 2;
  return {
    name: letter ? 'letter' : 'a4',
    widthPt,
    heightPt,
    marginPt,
    contentWidthPt,
    contentHeightPt: heightPt - marginPt * 2,
    contentWidthPx: contentWidthPt / PX_TO_PT,
  };
}

/** Where text sits; decides base size, weight, color and line height. */
export interface TextContext {
  kind: 'body' | 'heading' | 'cell' | 'code-block';
  level?: HeadingLevel;
  header?: boolean;
  quote?: boolean;
  /** Cell text color on filled cells (any CSS color). */
  color?: string;
}

export interface TextBaseStyle {
  family: ResolvedFamily;
  sizePx: number;
  weight: number;
  strongWeight: number;
  italic: boolean;
  color: string;
  lineHeight: number;
}

export function textBaseStyle(context: TextContext): TextBaseStyle {
  if (context.kind === 'heading') {
    const heading = DOCUMENT_STYLE.headings[context.level ?? 1];
    return {
      family: resolveFamily(DOCUMENT_STYLE.family),
      sizePx: heading.sizePx,
      weight: heading.weight,
      strongWeight: heading.strongWeight,
      italic: Boolean(context.quote),
      color: DOCUMENT_STYLE.color,
      lineHeight: heading.lineHeight,
    };
  }
  if (context.kind === 'code-block') {
    return {
      family: resolveFamily(MONOSPACE_FAMILY),
      sizePx: DOCUMENT_STYLE.codeBlock.sizePx,
      weight: 400,
      strongWeight: DOCUMENT_STYLE.strongWeight,
      italic: false,
      color: toHex(context.color) ?? DOCUMENT_STYLE.color,
      lineHeight: DOCUMENT_STYLE.codeBlock.lineHeightPx / DOCUMENT_STYLE.codeBlock.sizePx,
    };
  }
  const cell = context.kind === 'cell';
  const quoteWeight = context.quote ? DOCUMENT_STYLE.blockquote.weight : 400;
  return {
    family: resolveFamily(DOCUMENT_STYLE.family),
    sizePx: cell ? DOCUMENT_STYLE.table.sizePx : DOCUMENT_STYLE.sizePx,
    weight: cell && context.header ? DOCUMENT_STYLE.table.headerWeight : quoteWeight,
    strongWeight: DOCUMENT_STYLE.strongWeight,
    italic: Boolean(context.quote),
    color: toHex(context.color) ?? DOCUMENT_STYLE.color,
    lineHeight: cell ? DOCUMENT_STYLE.table.lineHeight : DOCUMENT_STYLE.lineHeight,
  };
}

/** A run's final appearance. Sizes in CSS px, colors as RRGGBB. */
export interface RunStyle {
  family: ResolvedFamily;
  weight: number;
  italic: boolean;
  sizePx: number;
  /** Size of the surrounding text, for super/subscript shifts. */
  parentSizePx: number;
  color: string;
  highlight?: string;
  underline: boolean;
  strike: boolean;
  superscript: boolean;
  subscript: boolean;
  code: boolean;
  link: boolean;
  /** Line height factor for this run's inline box. */
  lineHeight: number;
}

/**
 * Height of a CSS line box (px): the paragraph's strut and the inline box of
 * every run (super/subscripts have `line-height: 0`). Office formats use it as
 * "at least" line spacing, which matches CSS where proportional spacing would
 * scale the font's own line gap instead.
 */
export function lineBoxPx(base: TextBaseStyle, runs: RunStyle[]): number {
  return Math.max(base.sizePx * base.lineHeight, ...runs.map((style) => (style.lineHeight > 0 ? style.sizePx * style.lineHeight : 0)));
}

/** Resolves a CSS length against the surrounding font size (px). */
export function cssLengthToPx(value: string | undefined, parentPx: number): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (trimmed.endsWith('px')) return numeric;
  if (trimmed.endsWith('pt')) return numeric / PX_TO_PT;
  if (trimmed.endsWith('rem')) return numeric * 16;
  if (trimmed.endsWith('em')) return numeric * parentPx;
  if (trimmed.endsWith('%')) return (numeric / 100) * parentPx;
  return numeric;
}

function lineHeightFactor(value: string | undefined, sizePx: number): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'normal') return 1.2;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number.parseFloat(trimmed);
  const px = cssLengthToPx(trimmed, sizePx);
  return px ? px / sizePx : null;
}

export function resolveRunStyle(marks: ExportInlineMarks, link: ExportLink | undefined, base: TextBaseStyle): RunStyle {
  let sizePx = cssLengthToPx(marks.fontSize, base.sizePx) ?? base.sizePx;
  const parentSizePx = sizePx;
  // Explicit prose weights: links 500 (even inside headings), strong per
  // context (600 in text, 900/800/700 in h1–h3), inline code 600.
  let weight = base.weight;
  if (link) weight = DOCUMENT_STYLE.linkWeight;
  if (marks.bold) weight = base.strongWeight;
  let family = marks.fontFamily ? resolveFamily(marks.fontFamily) : base.family;
  if (marks.code) {
    family = resolveFamily(MONOSPACE_FAMILY);
    sizePx *= DOCUMENT_STYLE.inlineCode.scale;
    weight = DOCUMENT_STYLE.inlineCode.weight;
  }
  if (marks.superscript || marks.subscript) sizePx *= DOCUMENT_STYLE.script.scale;
  // A color set inside a link wins; the link's own color replaces inherited ones
  // (the model drops colors inherited from outside the link).
  const color = toHex(marks.color) ?? (link ? DOCUMENT_STYLE.linkColor : base.color);
  return {
    family,
    weight,
    italic: base.italic || Boolean(marks.italic),
    sizePx,
    parentSizePx,
    color,
    highlight: marks.highlight ? (toHex(marks.highlight) ?? undefined) : undefined,
    underline: Boolean(marks.underline) || Boolean(link),
    strike: Boolean(marks.strike),
    superscript: Boolean(marks.superscript),
    subscript: Boolean(marks.subscript),
    code: Boolean(marks.code),
    link: Boolean(link),
    lineHeight: marks.superscript || marks.subscript ? 0 : (lineHeightFactor(marks.lineHeight, sizePx) ?? base.lineHeight),
  };
}

/**
 * Vertical margins of one element, before collapsing. `previous` is the
 * preceding sibling: prose zeroes the top margin after h2, h3 and hr, but
 * only where no editor rule sets it (headings, centered images, graphics and
 * tables keep theirs).
 */
export interface MarginContext {
  container: 'root' | 'list-item' | 'blockquote' | 'cell';
  /** Index among siblings. */
  index: number;
  previous?: ExportBlock;
  /** Nesting depth of lists around this element (0 = not in a list). */
  listDepth: number;
  /** Kind of the outermost list when it is a direct child of the document (prose styles those lists). */
  rootList?: 'ordered' | 'bullet';
  /** Inside a table cell, where em-based margins scale with the 14px text. */
  inCell?: boolean;
}

export interface BlockMargins {
  top: number;
  bottom: number;
}

export function blockMargins(block: ExportBlock, context: MarginContext): BlockMargins {
  const afterReset =
    context.previous?.type === 'horizontal-rule' ||
    (context.previous?.type === 'heading' && (context.previous.level ?? 1) > 1);
  const top = (value: number) => (afterReset ? 0 : value);
  switch (block.type) {
    case 'paragraph': {
      if (context.container === 'cell') {
        return { top: DOCUMENT_STYLE.table.paragraphMarginTop, bottom: DOCUMENT_STYLE.table.paragraphMarginBottom };
      }
      if (context.container === 'list-item') {
        // Prose: `> ul > li p` 0.75em, `> ul|ol > li > p:first-child` 1.25em,
        // anything else the paragraph default (scaled to 14px in cells).
        let paragraphTop: number = DOCUMENT_STYLE.paragraph.marginTop;
        if (context.inCell) paragraphTop = DOCUMENT_STYLE.table.paragraphMarginTop;
        else if (context.rootList && context.listDepth === 1 && context.index === 0) paragraphTop = DOCUMENT_STYLE.list.firstParagraphMarginTop;
        else if (context.rootList === 'bullet') paragraphTop = DOCUMENT_STYLE.list.paragraphMarginTop;
        return { top: paragraphTop, bottom: DOCUMENT_STYLE.paragraph.marginBottom };
      }
      return { top: top(DOCUMENT_STYLE.paragraph.marginTop), bottom: DOCUMENT_STYLE.paragraph.marginBottom };
    }
    case 'heading': {
      const heading = DOCUMENT_STYLE.headings[block.level ?? 1];
      return { top: heading.marginTop, bottom: heading.marginBottom };
    }
    case 'list':
      return {
        top: top(em(context.listDepth > 0 ? DOCUMENT_STYLE.list.nestedMarginTop : DOCUMENT_STYLE.list.marginTop, context)),
        bottom: DOCUMENT_STYLE.list.marginBottom,
      };
    case 'blockquote': {
      const margin = em(DOCUMENT_STYLE.blockquote.margin, context);
      return { top: top(margin), bottom: margin };
    }
    case 'code-block':
      return { top: top(DOCUMENT_STYLE.codeBlock.margin), bottom: DOCUMENT_STYLE.codeBlock.margin };
    case 'table':
      return { top: DOCUMENT_STYLE.table.margin, bottom: DOCUMENT_STYLE.table.margin };
    case 'image':
      return block.float
        ? { top: DOCUMENT_STYLE.image.floatMargin, bottom: DOCUMENT_STYLE.image.floatMargin }
        : { top: DOCUMENT_STYLE.image.margin, bottom: DOCUMENT_STYLE.image.margin };
    case 'graphic':
      return { top: DOCUMENT_STYLE.graphic.margin, bottom: DOCUMENT_STYLE.graphic.margin };
    case 'horizontal-rule':
      return { top: top(DOCUMENT_STYLE.rule.margin), bottom: DOCUMENT_STYLE.rule.margin };
  }
}

/** Prose margins in `em` are measured at 16px; table text is 14px. */
function em(value: number, context: { inCell?: boolean }): number {
  return context.inCell ? (value * DOCUMENT_STYLE.table.sizePx) / DOCUMENT_STYLE.sizePx : value;
}

/** Margins of a list item box, which collapse with its first and last child. */
export function listItemMargins(inCell = false): BlockMargins {
  return { top: em(DOCUMENT_STYLE.list.itemMarginTop, { inCell }), bottom: DOCUMENT_STYLE.list.itemMarginBottom };
}

/**
 * A leaf block in reading order with the vertical gap before it, after CSS
 * margin collapsing through lists, list items and quotes. Office formats use
 * this for "space before" so their paragraphs are spaced like the editor.
 */
/** The list item a leaf starts, for formats that number paragraphs. */
export interface FlowListItem {
  list: ExportListBlock;
  index: number;
  /** Nesting depth, 1 = top level. */
  depth: number;
  /** Number of `ul` around the item, for disc/circle/square bullets. */
  bulletDepth: number;
}

export interface FlowLeaf {
  block: ExportBlock;
  /** Collapsed gap from the previous leaf (or, for the first, from the flow's top edge), px. */
  spaceBefore: number;
  container: MarginContext['container'];
  listDepth: number;
  quoteDepth: number;
  bulletDepth: number;
  /** Set on the first leaf of a list item (where the marker goes). */
  listItem?: FlowListItem;
}

interface FlowState {
  pendingBottom: number;
  pendingTop: number;
  pendingItem?: FlowListItem;
  leaves: FlowLeaf[];
}

export interface Flow {
  leaves: FlowLeaf[];
  /** Bottom margin after the last leaf (px). */
  trailing: number;
}

interface FlowScope {
  container: MarginContext['container'];
  listDepth: number;
  quoteDepth: number;
  bulletDepth: number;
  rootList?: 'ordered' | 'bullet';
  inCell: boolean;
}

/**
 * Walks blocks like the editor's CSS block formatting context. Page flows
 * drop the first leaf's gap; table cells keep both edges (cells have padding,
 * so their content margins do not collapse with the outside).
 */
export function flowLeaves(blocks: ExportBlock[], container: MarginContext['container'] = 'root'): Flow {
  const state: FlowState = { pendingBottom: 0, pendingTop: 0, leaves: [] };
  walkFlow(blocks, { container, listDepth: 0, quoteDepth: 0, bulletDepth: 0, inCell: container === 'cell' }, state);
  return { leaves: state.leaves, trailing: state.pendingBottom };
}

function walkFlow(blocks: ExportBlock[], scope: FlowScope, state: FlowState): void {
  blocks.forEach((block, index) => {
    const margins = blockMargins(block, {
      container: scope.container,
      index,
      previous: blocks[index - 1],
      listDepth: scope.listDepth,
      ...(scope.rootList ? { rootList: scope.rootList } : {}),
      inCell: scope.inCell,
    });
    if (block.type === 'list') {
      state.pendingTop = Math.max(state.pendingTop, margins.top);
      const bulletDepth = block.ordered ? scope.bulletDepth : scope.bulletDepth + 1;
      const rootList = scope.container === 'root' ? (block.ordered ? 'ordered' : 'bullet') : scope.rootList;
      const itemMargins = listItemMargins(scope.inCell);
      block.items.forEach((item, itemIndex) => {
        state.pendingTop = Math.max(state.pendingTop, itemMargins.top);
        state.pendingItem = { list: block, index: itemIndex, depth: scope.listDepth + 1, bulletDepth };
        walkFlow(
          item.blocks,
          { ...scope, container: 'list-item', listDepth: scope.listDepth + 1, bulletDepth, ...(rootList ? { rootList } : {}) },
          state,
        );
        state.pendingItem = undefined;
        state.pendingBottom = Math.max(state.pendingBottom, itemMargins.bottom);
      });
      state.pendingBottom = Math.max(state.pendingBottom, margins.bottom);
      return;
    }
    if (block.type === 'blockquote') {
      state.pendingTop = Math.max(state.pendingTop, margins.top);
      walkFlow(block.blocks, { ...scope, container: 'blockquote', quoteDepth: scope.quoteDepth + 1, rootList: undefined }, state);
      state.pendingBottom = Math.max(state.pendingBottom, margins.bottom);
      return;
    }
    // Floats do not take part in margin collapsing.
    const floating = block.type === 'image' && Boolean(block.float);
    const gap = floating ? margins.top : Math.max(state.pendingBottom, state.pendingTop, margins.top);
    state.leaves.push({
      block,
      spaceBefore: gap,
      container: scope.container,
      listDepth: scope.listDepth,
      quoteDepth: scope.quoteDepth,
      bulletDepth: scope.bulletDepth,
      ...(state.pendingItem ? { listItem: state.pendingItem } : {}),
    });
    state.pendingItem = undefined;
    if (floating) return;
    state.pendingTop = 0;
    state.pendingBottom = margins.bottom;
  });
}
