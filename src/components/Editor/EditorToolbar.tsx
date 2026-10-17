import { memo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  MoreHorizontal,
  Redo,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo,
  UnfoldVertical,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/hooks/useLocale';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRovingToolbar } from '@/hooks/useRovingToolbar';
import { keepEditorFocus } from '@/lib/inputModality';
import type { TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { SHORTCUTS } from './editorShortcuts';
import { FontPicker } from './FontPicker';
import { ImageToolbar } from './ImageToolbar';
import { SmartGraphicGallery } from './SmartGraphicGallery';
import { SmartGraphicToolbar } from './SmartGraphicToolbar';
import { TableGridPicker } from './TableGridPicker';
import { TableToolbar } from './TableToolbar';
import {
  ColorIndicator,
  ColorSwatchGrid,
  LinkPopover,
  PopoverSection,
  ShortcutLabel,
  ToolbarButton,
  ToolbarSeparator,
} from './toolbarControls';
import {
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  TEXT_BLOCK_STYLES,
  TEXT_COLORS,
  applyTextBlockStyle,
  useLineSpacings,
  useToolbarState,
  type TextAlignment,
  type TextBlockStyle,
} from './toolbarModel';

interface EditorToolbarProps {
  editor: Editor | null;
  /**
   * Free space in the header row. On one-row desktop toolbars, contextual
   * table/graphic tools render there so entering a table never wraps the
   * toolbar and shifts the document.
   */
  contextSlot?: HTMLElement | null;
}

const ALIGNMENTS: {
  value: TextAlignment;
  label: TranslationKey;
  icon: typeof AlignLeft;
  shortcut: string;
}[] = [
  { value: 'left', label: 'toolbarAlignLeft', icon: AlignLeft, shortcut: SHORTCUTS.alignLeft },
  { value: 'center', label: 'toolbarAlignCenter', icon: AlignCenter, shortcut: SHORTCUTS.alignCenter },
  { value: 'right', label: 'toolbarAlignRight', icon: AlignRight, shortcut: SHORTCUTS.alignRight },
  { value: 'justify', label: 'toolbarAlignJustify', icon: AlignJustify, shortcut: SHORTCUTS.alignJustify },
];

/** Style previews in the menu; the trigger keeps plain text. */
const BLOCK_STYLE_PREVIEW: Record<TextBlockStyle, string> = {
  paragraph: '',
  h1: 'text-lg font-bold',
  h2: 'text-base font-semibold',
  h3: 'font-semibold',
  blockquote: 'italic',
  codeBlock: 'font-mono text-[13px]',
};

/** Returns focus to the document after a menu choice, but not after Escape. */
function useReturnToEditor(editor: Editor) {
  const pickedRef = useRef(false);
  return {
    markPicked: () => {
      pickedRef.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (!pickedRef.current) return;
      pickedRef.current = false;
      event.preventDefault();
      if (!editor.isDestroyed) editor.commands.focus();
    },
  };
}

function ColorButton({
  editor,
  kind,
  current,
  label,
  icon,
  shortcut,
}: {
  editor: Editor;
  kind: 'text' | 'highlight';
  current?: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
}) {
  const [open, setOpen] = useState(false);
  const focus = useReturnToEditor(editor);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolbarButton label={label} shortcut={shortcut}>
          <ColorIndicator color={current}>{icon}</ColorIndicator>
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent aria-label={label} className="w-auto p-3" onCloseAutoFocus={focus.onCloseAutoFocus}>
        <PopoverSection title={label}>
          <ColorSwatchGrid
            editor={editor}
            kind={kind}
            colors={kind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS}
            current={current}
            onPick={() => {
              focus.markPicked();
              setOpen(false);
            }}
          />
        </PopoverSection>
      </PopoverContent>
    </Popover>
  );
}

/** Top toolbar for tablets and desktops; phones use `MobileToolbar`. */
export const EditorToolbar = memo(function EditorToolbar({
  editor,
  contextSlot,
}: EditorToolbarProps) {
  const { t } = useLocale();
  const wide = useMediaQuery('(min-width: 1280px)');
  const [expanded, setExpanded] = useState(false);
  const state = useToolbarState(editor);
  const lineSpacings = useLineSpacings(t);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const onToolbarKeyDown = useRovingToolbar(toolbarRef);

  if (!editor || !state) return null;

  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) =>
    command(editor.chain().focus()).run();
  const alignment = ALIGNMENTS.find((item) => item.value === state.alignment) ?? ALIGNMENTS[0];
  const AlignmentIcon = alignment.icon;

  const contextTools =
    state.inTable || state.inGraphic ? (
      <div
        className="toolbar-context"
        onMouseDown={keepEditorFocus}
        role="group"
        aria-label={t(state.inTable ? 'tableTools' : 'graphicTools')}
      >
        {state.inTable ? <TableToolbar editor={editor} showInsert={false} /> : null}
        {state.inGraphic ? <SmartGraphicToolbar editor={editor} showInsert={false} /> : null}
      </div>
    ) : null;

  return (
    <div
      ref={toolbarRef}
      className="editor-toolbar"
      role="toolbar"
      aria-label={t('formattingToolbar')}
      onKeyDown={onToolbarKeyDown}
      // Buttons keep the editor's selection (and a touch keyboard) in place.
      onMouseDown={keepEditorFocus}
    >
      <div className="toolbar-primary">
        <div className="toolbar-group">
          <ToolbarButton
            label={t('toolbarUndo')}
            shortcut={SHORTCUTS.undo}
            disabled={!state.canUndo}
            onClick={() => run((chain) => chain.undo())}
          >
            <Undo />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarRedo')}
            shortcut={SHORTCUTS.redo}
            disabled={!state.canRedo}
            onClick={() => run((chain) => chain.redo())}
          >
            <Redo />
          </ToolbarButton>
        </div>
        <ToolbarSeparator />
        <div className="toolbar-group">
          <Select
            value={state.blockStyle}
            onValueChange={(value) => applyTextBlockStyle(editor, value as TextBlockStyle)}
          >
            <SelectTrigger className="toolbar-select w-[7.25rem]" aria-label={t('toolbarTextStyle')}>
              <SelectValue placeholder={t('toolbarTextStyle')} />
            </SelectTrigger>
            <SelectContent
              className="min-w-44"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                editor.commands.focus();
              }}
            >
              {TEXT_BLOCK_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value} className={BLOCK_STYLE_PREVIEW[style.value]}>
                  {t(style.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FontPicker
            value={state.fontFamily}
            triggerClassName="toolbar-select w-[7.25rem]"
            onChange={(value) => {
              if (value === '') editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
            }}
          />
          <Select
            value={state.fontSize}
            onValueChange={(value) => {
              // With a collapsed cursor the mark is stored, so the next typed
              // characters pick up the requested size.
              editor.chain().focus().setMark('textStyle', { fontSize: value }).run();
            }}
          >
            <SelectTrigger className="toolbar-select w-[4.25rem] tabular-nums" aria-label={t('toolbarFontSize')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              onCloseAutoFocus={(event) => {
                // Radix returns focus to the trigger by default, which pulls focus
                // out of the document and makes the new size feel "not applied".
                event.preventDefault();
                editor.commands.focus();
              }}
            >
              {FONT_SIZES.map((size) => (
                <SelectItem key={size} value={size} className="tabular-nums">
                  {Number.parseInt(size, 10)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ToolbarSeparator />
        <div className="toolbar-group">
          <ToolbarButton
            label={t('toolbarBold')}
            shortcut={SHORTCUTS.bold}
            pressed={state.bold}
            onClick={() => run((chain) => chain.toggleBold())}
          >
            <Bold />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarItalic')}
            shortcut={SHORTCUTS.italic}
            pressed={state.italic}
            onClick={() => run((chain) => chain.toggleItalic())}
          >
            <Italic />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarUnderline')}
            shortcut={SHORTCUTS.underline}
            pressed={state.underline}
            onClick={() => run((chain) => chain.toggleUnderline())}
          >
            <Underline />
          </ToolbarButton>
        </div>
        <ToolbarSeparator />
        <div className="toolbar-group">
          <ToolbarButton
            label={t('toolbarBulletList')}
            shortcut={SHORTCUTS.bulletList}
            pressed={state.bulletList}
            onClick={() => run((chain) => chain.toggleBulletList())}
          >
            <List />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarOrderedList')}
            shortcut={SHORTCUTS.orderedList}
            pressed={state.orderedList}
            onClick={() => run((chain) => chain.toggleOrderedList())}
          >
            <ListOrdered />
          </ToolbarButton>
        </div>
        {/* Contextual tools stay visible on tablets even while the secondary
            row is collapsed; wide screens show them in the header row. */}
        {contextTools && wide && contextSlot ? createPortal(contextTools, contextSlot) : contextTools}
        <ToolbarButton
          label={t(expanded ? 'lessFormatting' : 'moreFormatting')}
          className="toolbar-more ms-auto"
          aria-expanded={expanded}
          aria-controls="secondary-formatting"
          onClick={() => setExpanded((value) => !value)}
        >
          <MoreHorizontal />
        </ToolbarButton>
      </div>
      <div id="secondary-formatting" className={cn('toolbar-secondary', expanded && 'is-expanded')}>
        <ToolbarSeparator className="toolbar-row-separator" />
        <div className="toolbar-group">
          <ToolbarButton
            label={t('toolbarStrikethrough')}
            shortcut={SHORTCUTS.strike}
            pressed={state.strike}
            onClick={() => run((chain) => chain.toggleStrike())}
          >
            <Strikethrough />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarInlineCode')}
            shortcut={SHORTCUTS.code}
            pressed={state.code}
            onClick={() => run((chain) => chain.toggleCode())}
          >
            <Code />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarSuperscript')}
            shortcut={SHORTCUTS.superscript}
            pressed={state.superscript}
            onClick={() => run((chain) => chain.toggleSuperscript())}
          >
            <Superscript />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarSubscript')}
            shortcut={SHORTCUTS.subscript}
            pressed={state.subscript}
            onClick={() => run((chain) => chain.toggleSubscript())}
          >
            <Subscript />
          </ToolbarButton>
        </div>
        <ToolbarSeparator />
        <div className="toolbar-group">
          <ColorButton
            editor={editor}
            kind="text"
            current={state.textColor}
            label={t('toolbarTextColor')}
            icon={<span className="text-[15px] font-semibold leading-none">A</span>}
          />
          <ColorButton
            editor={editor}
            kind="highlight"
            current={state.highlightColor}
            label={t('toolbarHighlight')}
            shortcut={SHORTCUTS.highlight}
            icon={<Highlighter className="size-3.5!" />}
          />
          <ToolbarButton
            label={t('toolbarClearFormatting')}
            onClick={() => run((chain) => chain.unsetAllMarks().clearNodes())}
          >
            <RemoveFormatting />
          </ToolbarButton>
        </div>
        <ToolbarSeparator />
        <div className="toolbar-group">
          <AlignmentMenu
            editor={editor}
            value={state.alignment}
            label={t('paragraphAlignment')}
            icon={<AlignmentIcon />}
          />
          <LineSpacingMenu
            editor={editor}
            value={state.lineHeight}
            label={t('toolbarLineSpacing')}
            options={[{ name: t('fontDefault'), value: '' }, ...lineSpacings]}
          />
          <ToolbarButton
            label={t('toolbarDecreaseIndent')}
            shortcut={SHORTCUTS.outdent}
            disabled={!state.canOutdent}
            onClick={() => run((chain) => chain.liftListItem('listItem'))}
          >
            <IndentDecrease className="rtl:-scale-x-100" />
          </ToolbarButton>
          <ToolbarButton
            label={t('toolbarIncreaseIndent')}
            shortcut={SHORTCUTS.indent}
            disabled={!state.canIndent}
            onClick={() => run((chain) => chain.sinkListItem('listItem'))}
          >
            <IndentIncrease className="rtl:-scale-x-100" />
          </ToolbarButton>
        </div>
        <ToolbarSeparator />
        <div className="toolbar-group">
          <LinkPopover
            editor={editor}
            trigger={
              <ToolbarButton label={t('toolbarLink')} pressed={state.link}>
                <Link />
              </ToolbarButton>
            }
          />
          <ImageToolbar editor={editor} />
          <TableGridPicker editor={editor} />
          <SmartGraphicGallery editor={editor} />
          <ToolbarButton
            label={t('toolbarHorizontalRule')}
            onClick={() => run((chain) => chain.setHorizontalRule())}
          >
            <SeparatorHorizontal />
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
});

function AlignmentMenu({
  editor,
  value,
  label,
  icon,
}: {
  editor: Editor;
  value?: TextAlignment;
  label: string;
  icon: ReactNode;
}) {
  const { t } = useLocale();
  const focus = useReturnToEditor(editor);
  // Tablets use this toolbar: a scroll that starts on the button must not open it.
  const menu = useTouchSafeMenu();
  return (
    <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild {...menu.triggerProps}>
        <ToolbarButton label={label}>{icon}</ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={focus.onCloseAutoFocus}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? 'left'}
          onValueChange={(next) => {
            focus.markPicked();
            editor.chain().focus().setTextAlign(next).run();
          }}
        >
          {ALIGNMENTS.map(({ value: option, label: optionLabel, icon: Icon, shortcut }) => (
            <DropdownMenuRadioItem key={option} value={option}>
              <Icon aria-hidden="true" />
              {t(optionLabel)}
              <DropdownMenuShortcut>
                <ShortcutLabel shortcut={shortcut} />
              </DropdownMenuShortcut>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LineSpacingMenu({
  editor,
  value,
  label,
  options,
}: {
  editor: Editor;
  value: string;
  label: string;
  options: { name: string; value: string }[];
}) {
  const focus = useReturnToEditor(editor);
  const menu = useTouchSafeMenu();
  return (
    <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild {...menu.triggerProps}>
        <ToolbarButton label={label}>
          <UnfoldVertical />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40" onCloseAutoFocus={focus.onCloseAutoFocus}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            focus.markPicked();
            editor
              .chain()
              .focus()
              .setMark('textStyle', { lineHeight: next || null })
              .removeEmptyTextStyle()
              .run();
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value || 'default'} value={option.value} className="tabular-nums">
              {option.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
