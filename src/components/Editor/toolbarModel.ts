import { useMemo } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import type { TranslationKey } from '@/lib/translations';

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

export const TEXT_COLORS = [
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
  '#FFFFFF',
] as const;

export const REMOVE_HIGHLIGHT = 'transparent';

export const HIGHLIGHT_COLORS = [
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
  REMOVE_HIGHLIGHT,
] as const;

export type TextBlockStyle = 'paragraph' | 'h1' | 'h2' | 'h3';

export const TEXT_BLOCK_STYLES: { value: TextBlockStyle; label: TranslationKey }[] = [
  { value: 'paragraph', label: 'toolbarStyleNormal' },
  { value: 'h1', label: 'toolbarStyleH1' },
  { value: 'h2', label: 'toolbarStyleH2' },
  { value: 'h3', label: 'toolbarStyleH3' },
];

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export function applyTextBlockStyle(editor: Editor, value: TextBlockStyle) {
  if (value === 'paragraph') {
    editor.chain().focus().setParagraph().run();
  } else {
    const level = Number(value.slice(1)) as 1 | 2 | 3;
    editor.chain().focus().setHeading({ level }).run();
  }
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
  return `${next ?? (direction > 0 ? sizes[sizes.length - 1] : sizes[0])}px`;
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
      const textStyle = current.getAttributes('textStyle');
      const fontSize: unknown = textStyle.fontSize;
      const fontFamily: unknown = textStyle.fontFamily;
      const lineHeight: unknown = textStyle.lineHeight;
      const heading = ([1, 2, 3] as const).find((level) => current.isActive('heading', { level }));
      return {
        fontSize: typeof fontSize === 'string' && fontSize ? fontSize : DEFAULT_FONT_SIZE,
        fontFamily: typeof fontFamily === 'string' ? fontFamily : '',
        lineHeight: typeof lineHeight === 'string' ? lineHeight : '',
        blockStyle: (heading ? `h${heading}` : 'paragraph') as TextBlockStyle,
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        superscript: current.isActive('superscript'),
        subscript: current.isActive('subscript'),
        link: current.isActive('link'),
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        alignment: (['left', 'center', 'right', 'justify'] as const).find((textAlign) =>
          current.isActive({ textAlign }),
        ),
        inTable: current.isActive('table'),
        inGraphic: current.isActive('smartGraphic'),
        imageSelected: current.isActive('image'),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        canIndent: current.can().sinkListItem('listItem'),
        canOutdent: current.can().liftListItem('listItem'),
      };
    },
  });
}

export type ToolbarState = NonNullable<ReturnType<typeof useToolbarState>>;
