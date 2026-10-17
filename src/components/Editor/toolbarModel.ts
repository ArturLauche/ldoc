import { useMemo } from 'react';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { useEditorState, type Editor } from '@tiptap/react';
import type { TranslationKey } from '@/lib/translations';
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
  '#FEF08A',
  '#FDE68A',
  '#FECACA',
  '#D1FAE5',
  '#CFFAFE',
  '#DDD6FE',
  '#FBCFE8',
  '#FED7AA',
  '#E0E7FF',
  '#CCE5FF',
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

/**
 * Turns the current blocks into one style. Quotes wrap paragraphs, so other
 * styles first leave any quote; choosing the active quote again lifts it.
 */
export function applyTextBlockStyle(editor: Editor, value: TextBlockStyle) {
  const chain = editor.chain().focus();
  if (value === 'blockquote') {
    if (editor.isActive('codeBlock')) chain.setParagraph();
    chain.toggleBlockquote().run();
    return;
  }
  if (editor.isActive('blockquote')) chain.lift('blockquote');
  if (value === 'paragraph') chain.setParagraph().run();
  else if (value === 'codeBlock') chain.setCodeBlock().run();
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
      const nodeActive = selectionNodes(current.state).isActive;
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
        textColor: typeof color === 'string' && color ? color : undefined,
        highlightColor: typeof highlight === 'string' && highlight ? highlight : undefined,
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
        // Only blocks carry textAlign, so the node answer is the full answer.
        alignment: (['left', 'center', 'right', 'justify'] as const).find((textAlign) =>
          nodeActive(null, { textAlign }),
        ),
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
