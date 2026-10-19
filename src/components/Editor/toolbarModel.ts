import { useMemo } from 'react';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { liftTarget } from '@tiptap/pm/transform';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { useEditorState, type Editor } from '@tiptap/react';
import type { TranslationKey } from '@/lib/translations';
import { DEFAULT_HIGHLIGHT_COLOR } from './editorExtensions';
import { SHORTCUTS } from './editorShortcuts';
import { selectionNodes } from './selectionNodes';

export const FONT_SIZES = [
  '10px',
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '24px',
  '28px',
  '32px',
  '36px',
  '48px',
] as const;

export const DEFAULT_FONT_SIZE = '16px';
export const MIN_FONT_SIZE_PX = Number.parseFloat(FONT_SIZES[0]);
export const MAX_FONT_SIZE_PX = Number.parseFloat(FONT_SIZES[FONT_SIZES.length - 1]);

/** Swatch value that removes the color (automatic text color, no highlight). */
export const NO_COLOR = 'transparent';
/** How browsers paint a <mark> without a color (imported documents). */
const DEFAULT_MARK_COLOR = '#FFFF00';

export const TEXT_COLORS = [
  NO_COLOR,
  '#000000',
  '#374151',
  '#6B7280',
  '#DC2626',
  '#EA580C',
  '#CA8A04',
  '#16A34A',
  '#0EA5E9',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
] as const;

export const HIGHLIGHT_COLORS = [
  NO_COLOR,
  DEFAULT_HIGHLIGHT_COLOR,
  '#FDE68A',
  '#FECACA',
  '#D1FAE5',
  '#CFFAFE',
  '#DDD6FE',
  '#FBCFE8',
  '#FED7AA',
  '#E0E7FF',
  '#CCE5FF',
  '#E5E7EB',
] as const;

export type TextBlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'codeBlock';

export const TEXT_BLOCK_STYLES: {
  value: TextBlockStyle;
  label: TranslationKey;
  shortcut: string;
}[] = [
  { value: 'paragraph', label: 'toolbarStyleNormal', shortcut: SHORTCUTS.paragraph },
  { value: 'h1', label: 'toolbarStyleH1', shortcut: SHORTCUTS.heading1 },
  { value: 'h2', label: 'toolbarStyleH2', shortcut: SHORTCUTS.heading2 },
  { value: 'h3', label: 'toolbarStyleH3', shortcut: SHORTCUTS.heading3 },
  { value: 'blockquote', label: 'toolbarBlockquote', shortcut: SHORTCUTS.blockquote },
  { value: 'codeBlock', label: 'toolbarCodeBlock', shortcut: SHORTCUTS.codeBlock },
];

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

const TEXT_ALIGNMENTS: readonly TextAlignment[] = ['left', 'center', 'right', 'justify'];
const LETTER = /\p{L}/u;
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

function firstLetterDirection(node: ProseMirrorNode): 'ltr' | 'rtl' | null {
  if (node.isText) {
    const letter = LETTER.exec(node.text ?? '')?.[0];
    return letter ? (RTL_LETTER.test(letter) ? 'rtl' : 'ltr') : null;
  }
  for (let index = 0; index < node.childCount; index++) {
    const direction = firstLetterDirection(node.child(index));
    if (direction) return direction;
  }
  return null;
}

const directions = new WeakMap<ProseMirrorNode, 'ltr' | 'rtl'>();

/**
 * The document's direction as the editor's `dir="auto"` resolves it: from
 * the first letter. Blocks without an alignment start on that side. Cached
 * per document, so selection changes cost nothing.
 */
function documentDirection(doc: ProseMirrorNode): 'ltr' | 'rtl' {
  let direction = directions.get(doc);
  if (!direction) {
    direction = firstLetterDirection(doc) ?? 'ltr';
    directions.set(doc, direction);
  }
  return direction;
}

/** Text blocks in every range of the selection (a cell selection has one per cell). */
function selectedTextblocks(state: EditorState, fromMainRange: () => ProseMirrorNode[]): ProseMirrorNode[] {
  const { ranges } = state.selection;
  if (ranges.length < 2) return fromMainRange();
  const blocks: ProseMirrorNode[] = [];
  for (const { $from, $to } of ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node) => {
      if (node.isTextblock) blocks.push(node);
      return !node.isTextblock;
    });
  }
  return blocks;
}

/**
 * The alignment shared by every selected text block (list and table wrappers
 * carry none), or undefined when they differ.
 */
function selectionAlignment(doc: ProseMirrorNode, blocks: ProseMirrorNode[]): TextAlignment | undefined {
  const values = new Set(
    blocks.map((block): TextAlignment | null => {
      const value: unknown = block.attrs.textAlign;
      return TEXT_ALIGNMENTS.find((alignment) => alignment === value) ?? null;
    }),
  );
  if (values.size !== 1) return undefined;
  const [value] = values;
  return value ?? (documentDirection(doc) === 'rtl' ? 'right' : 'left');
}

/**
 * Stored colors come back from HTML as `rgb()`; the palettes are hex. Same
 * color, same string, so a swatch can show that it is applied.
 */
export function normalizeColor(value: string): string {
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*(?:1|1\.0+|100%)\s*)?\)$/i.exec(value.trim());
  if (!rgb) return value;
  return `#${rgb
    .slice(1, 4)
    .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

/** Depth of the innermost isolating ancestor (a table cell), or 0. */
function isolatingDepth($pos: ResolvedPos): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.spec.isolating) return depth;
  }
  return 0;
}

/**
 * Lifts the selected blocks out of every quote around them. A plain `lift`
 * takes the innermost wrapper, which dissolves a list inside a quote. Quotes
 * outside the table cell holding the selection stay: lifting one would move
 * the whole table.
 */
function leaveQuotes({ tr }: { tr: Transaction }): boolean {
  for (let depth = tr.selection.$from.depth; depth > 0; depth--) {
    const { $from, $to } = tr.selection;
    const range = $from.blockRange($to, (node) => node.type.name === 'blockquote');
    if (!range || range.depth < isolatingDepth($from)) break;
    const target = liftTarget(range);
    if (target === null) break;
    tr.lift(range, target);
  }
  return true;
}

/**
 * Turns the current blocks into one style. Quotes wrap paragraphs, so other
 * styles first leave any quote; choosing the active quote again lifts it.
 */
export function applyTextBlockStyle(editor: Editor, value: TextBlockStyle) {
  if (value === 'blockquote') {
    // "Quote" is a quoted paragraph: a heading or code block already inside
    // a quote becomes one too. Only a quoted paragraph toggles back.
    const chain = editor.chain().focus();
    const quoted = editor.isActive('blockquote');
    const paragraph = !editor.isActive('heading') && !editor.isActive('codeBlock');
    if (quoted && paragraph) chain.command(leaveQuotes);
    else {
      if (!paragraph) chain.setParagraph();
      if (!quoted) chain.wrapIn('blockquote');
    }
    chain.run();
    return;
  }
  // Leaving the quote is a transaction of its own: TipTap's setNode falls
  // back to clearNodes, which maps the chain's lifted positions a second
  // time and fails (RangeError) or drops the style. History still groups
  // the two as one undo step.
  editor.chain().focus().command(leaveQuotes).run();
  const chain = editor.chain().focus();
  if (value === 'paragraph') {
    // Paragraphs already: setParagraph would fall back to clearNodes and
    // dissolve the list they are in.
    if (editor.isActive('heading') || editor.isActive('codeBlock')) chain.setParagraph().run();
  } else if (value === 'codeBlock') chain.setCodeBlock().run();
  else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
}

/** Next size in the toolbar scale; free-form imported sizes snap to the nearest step. */
export function stepFontSize(current: string, direction: 1 | -1): string {
  const px = Number.parseFloat(current);
  const value = Number.isFinite(px) ? px : Number.parseFloat(DEFAULT_FONT_SIZE);
  const sizes = FONT_SIZES.map((size) => Number.parseFloat(size));
  const next =
    direction > 0
      ? sizes.find((size) => size > value)
      : [...sizes].reverse().find((size) => size < value);
  return `${next ?? (direction > 0 ? MAX_FONT_SIZE_PX : MIN_FONT_SIZE_PX)}px`;
}

export function useLineSpacings(t: (key: TranslationKey) => string) {
  return useMemo(
    () => [
      { name: t('toolbarSpacingSingle'), value: '1' },
      { name: '1.15', value: '1.15' },
      { name: '1.5', value: '1.5' },
      { name: t('toolbarSpacingDouble'), value: '2' },
    ],
    [t],
  );
}

/** Formatting state both toolbars render from; re-renders only when it changes. */
export function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      // Node questions share one walk over the selection (see selectionNodes).
      const nodes = selectionNodes(current.state);
      const nodeActive = nodes.isActive;
      const listItem = current.schema.nodes.listItem;
      const textStyle = current.getAttributes('textStyle');
      const fontSize: unknown = textStyle.fontSize;
      const fontFamily: unknown = textStyle.fontFamily;
      const lineHeight: unknown = textStyle.lineHeight;
      const color: unknown = textStyle.color;
      const highlight: unknown = current.getAttributes('highlight').color;
      const heading = ([1, 2, 3] as const).find((level) => nodeActive('heading', { level }));
      const blockStyle: TextBlockStyle = nodeActive('codeBlock')
        ? 'codeBlock'
        : heading
          ? (`h${heading}` as TextBlockStyle)
          : nodeActive('blockquote')
            ? 'blockquote'
            : 'paragraph';
      return {
        fontSize: typeof fontSize === 'string' && fontSize ? fontSize : DEFAULT_FONT_SIZE,
        fontFamily: typeof fontFamily === 'string' ? fontFamily : '',
        lineHeight: typeof lineHeight === 'string' ? lineHeight : '',
        blockStyle,
        textColor: typeof color === 'string' && color ? normalizeColor(color) : undefined,
        // A highlight without a color (imported <mark>) is still a highlight.
        highlightColor:
          typeof highlight === 'string' && highlight
            ? normalizeColor(highlight)
            : current.isActive('highlight')
              ? DEFAULT_MARK_COLOR
              : undefined,
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        superscript: current.isActive('superscript'),
        subscript: current.isActive('subscript'),
        code: current.isActive('code'),
        link: current.isActive('link'),
        bulletList: nodeActive('bulletList'),
        orderedList: nodeActive('orderedList'),
        alignment: selectionAlignment(current.state.doc, selectedTextblocks(current.state, nodes.textblocks)),
        inTable: nodeActive('table'),
        inGraphic: nodeActive('smartGraphic'),
        imageSelected: nodeActive('image'),
        // The commands behind can().undo() and can().sinkListItem(), asked
        // directly: a can() chain wraps every editor command on each call.
        canUndo: undoDepth(current.state) > 0,
        canRedo: redoDepth(current.state) > 0,
        canIndent: listItem ? sinkListItem(listItem)(current.state) : false,
        canOutdent: listItem ? liftListItem(listItem)(current.state) : false,
      };
    },
  });
}

export type ToolbarState = NonNullable<ReturnType<typeof useToolbarState>>;

/**
 * `onOpenAutoFocus` for swatch popovers: focus starts on the applied swatch,
 * so the focus ring and the selection mark the same color instead of the
 * first swatch looking selected too.
 */
export function focusPressedSwatch(event: Event) {
  const pressed =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget.querySelector<HTMLElement>('[aria-pressed="true"]')
      : null;
  if (!pressed) return;
  event.preventDefault();
  pressed.focus();
}
