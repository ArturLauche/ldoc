import type { TranslationKey } from '@/lib/translations';

/**
 * TipTap's default key bindings plus LWrite's own (`Mod` is ⌘ or Ctrl).
 * Toolbars show these in tooltips; the shortcuts dialog lists them.
 */
export const SHORTCUTS = {
  undo: 'Mod+Z',
  redo: 'Mod+Shift+Z',
  bold: 'Mod+B',
  italic: 'Mod+I',
  underline: 'Mod+U',
  strike: 'Mod+Shift+S',
  code: 'Mod+E',
  superscript: 'Mod+.',
  subscript: 'Mod+,',
  highlight: 'Mod+Shift+H',
  paragraph: 'Mod+Alt+0',
  heading1: 'Mod+Alt+1',
  heading2: 'Mod+Alt+2',
  heading3: 'Mod+Alt+3',
  blockquote: 'Mod+Shift+B',
  codeBlock: 'Mod+Alt+C',
  bulletList: 'Mod+Shift+8',
  orderedList: 'Mod+Shift+7',
  indent: 'Tab',
  outdent: 'Shift+Tab',
  alignLeft: 'Mod+Shift+L',
  alignCenter: 'Mod+Shift+E',
  alignRight: 'Mod+Shift+R',
  alignJustify: 'Mod+Shift+J',
  lineBreak: 'Shift+Enter',
  save: 'Mod+S',
  find: 'Mod+F',
  shortcuts: 'Mod+/',
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;

export const SHORTCUT_GROUPS: { label: TranslationKey; items: { id: ShortcutId; label: TranslationKey }[] }[] = [
  {
    label: 'shortcutsGroupGeneral',
    items: [
      { id: 'save', label: 'fileMenuSave' },
      { id: 'find', label: 'findReplaceTitle' },
      { id: 'undo', label: 'toolbarUndo' },
      { id: 'redo', label: 'toolbarRedo' },
      { id: 'shortcuts', label: 'keyboardShortcuts' },
    ],
  },
  {
    label: 'shortcutsGroupText',
    items: [
      { id: 'bold', label: 'toolbarBold' },
      { id: 'italic', label: 'toolbarItalic' },
      { id: 'underline', label: 'toolbarUnderline' },
      { id: 'strike', label: 'toolbarStrikethrough' },
      { id: 'code', label: 'toolbarInlineCode' },
      { id: 'highlight', label: 'toolbarHighlight' },
      { id: 'superscript', label: 'toolbarSuperscript' },
      { id: 'subscript', label: 'toolbarSubscript' },
    ],
  },
  {
    label: 'shortcutsGroupParagraph',
    items: [
      { id: 'paragraph', label: 'toolbarStyleNormal' },
      { id: 'heading1', label: 'toolbarStyleH1' },
      { id: 'heading2', label: 'toolbarStyleH2' },
      { id: 'heading3', label: 'toolbarStyleH3' },
      { id: 'blockquote', label: 'toolbarBlockquote' },
      { id: 'codeBlock', label: 'toolbarCodeBlock' },
      { id: 'bulletList', label: 'toolbarBulletList' },
      { id: 'orderedList', label: 'toolbarOrderedList' },
      { id: 'indent', label: 'toolbarIncreaseIndent' },
      { id: 'outdent', label: 'toolbarDecreaseIndent' },
      { id: 'alignLeft', label: 'toolbarAlignLeft' },
      { id: 'alignCenter', label: 'toolbarAlignCenter' },
      { id: 'alignRight', label: 'toolbarAlignRight' },
      { id: 'alignJustify', label: 'toolbarAlignJustify' },
      { id: 'lineBreak', label: 'shortcutLineBreak' },
    ],
  },
];
