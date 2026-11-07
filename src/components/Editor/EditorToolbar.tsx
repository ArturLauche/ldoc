import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  Plus,
  Redo,
  RemoveFormatting,
  SeparatorHorizontal,
  Strikethrough,
  Subscript,
  Superscript,
  Type,
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
import { useScrollFade } from '@/hooks/useScrollFade';
import { keepEditorFocus } from '@/lib/inputModality';
import type { TranslationKey } from '@/lib/translations';
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
  ToolTile,
} from './toolbarControls';
import {
  applyTextBlockStyle,
  focusPressedSwatch,
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  TEXT_BLOCK_STYLES,
  TEXT_COLORS,
  type TextAlignment,
  type TextBlockStyle,
  type ToolbarState,
  useLineSpacings,
  useToolbarState,
} from './toolbarModel';

interface EditorToolbarProps {
  editor: Editor | null;
  /**
   * Free space in the header row. On wide screens contextual table/graphic
   * tools render there so entering a table never grows the toolbar.
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
function useReturnToEditor(editor: Editor | null) {
  const pickedRef = useRef(false);
  return {
    markPicked: () => {
      pickedRef.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (!pickedRef.current) return;
      pickedRef.current = false;
      event.preventDefault();
      if (editor && !editor.isDestroyed) editor.commands.focus();
    },
  };
}

/**
 * Nested popovers, menus and dialogs portal outside their parent popover.
 * Without this guard the parent dismisses itself the moment the child opens.
 */
function keepNestedOverlayOpen(event: { target: EventTarget | null; preventDefault(): void }) {
  if (
    event.target instanceof Element &&
    event.target.closest(
      '[data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [data-radix-dialog-overlay]',
    )
  ) {
    event.preventDefault();
  }
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
          <ColorIndicator color={current} empty={kind === 'highlight' ? 'none' : 'current'}>
            {icon}
          </ColorIndicator>
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        aria-label={label}
        className="w-auto p-3"
        onOpenAutoFocus={focusPressedSwatch}
        onCloseAutoFocus={focus.onCloseAutoFocus}
      >
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
  // Matches `.header-context-slot` in index.css.
  const wide = useMediaQuery('(min-width: 1024px)');
  const regular = useMediaQuery('(min-width: 768px)');
  // Touch controls are 4px wider, so the full row needs a little more room.
  const full = useMediaQuery('(min-width: 1280px) and (pointer: fine), (min-width: 1360px)');
  const [formatOpen, setFormatOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const state = useToolbarState(editor);
  const lineSpacings = useLineSpacings(t);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fadeRef = useScrollFade<HTMLDivElement>();
  const attachToolbar = useCallback(
    (node: HTMLDivElement | null) => {
      toolbarRef.current = node;
      const cleanup = fadeRef(node);
      return () => {
        cleanup?.();
        if (toolbarRef.current === node) toolbarRef.current = null;
      };
    },
    [fadeRef],
  );
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
      ref={attachToolbar}
      className="editor-toolbar scroll-strip"
      role="toolbar"
      aria-label={t('formattingToolbar')}
      onKeyDown={onToolbarKeyDown}
      // Buttons keep the editor's selection (and a touch keyboard) in place.
      onMouseDown={keepEditorFocus}
    >
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
        {full ? (
          <FontPicker
            value={state.fontFamily}
            triggerClassName="toolbar-select w-[7.25rem]"
            onChange={(value) => {
              if (value === '') editor.chain().focus().unsetFontFamily().run();
              else editor.chain().focus().setFontFamily(value).run();
            }}
          />
        ) : null}
        {regular ? (
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
        ) : null}
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
        {regular ? (
          <ToolbarButton
            label={t('toolbarUnderline')}
            shortcut={SHORTCUTS.underline}
            pressed={state.underline}
            onClick={() => run((chain) => chain.toggleUnderline())}
          >
            <Underline />
          </ToolbarButton>
        ) : null}
        {full ? (
          <>
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
          </>
        ) : null}
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
        {full ? (
          <>
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
          </>
        ) : null}
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
      {/* Wide screens move contextual tools into the header's free space. */}
      {contextTools && wide && contextSlot ? createPortal(contextTools, contextSlot) : contextTools}
      {wide ? (
        <>
          <ToolbarSeparator />
          <div className="toolbar-group">
            <AlignmentMenu
              editor={editor}
              value={state.alignment}
              label={t('paragraphAlignment')}
              icon={<AlignmentIcon />}
            />
            {full ? (
              <>
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
              </>
            ) : null}
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
        </>
      ) : null}
      {!full ? (
        <>
          <ToolbarSeparator />
          <FormatPopover
            editor={editor}
            state={state}
            lineSpacings={lineSpacings}
            regular={regular}
            wide={wide}
            open={formatOpen}
            onOpenChange={setFormatOpen}
          />
        </>
      ) : null}
      {!wide ? (
        <InsertPopover editor={editor} open={insertOpen} onOpenChange={setInsertOpen} />
      ) : null}
    </div>
  );
});

/** Less common formatting, grouped by what it changes instead of a second row. */
function FormatPopover({
  editor,
  state,
  lineSpacings,
  regular,
  wide,
  open,
  onOpenChange,
}: {
  editor: Editor;
  state: ToolbarState;
  lineSpacings: { name: string; value: string }[];
  regular: boolean;
  wide: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const focus = useReturnToEditor(editor);
  const pick = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    focus.markPicked();
    onOpenChange(false);
    command(editor.chain().focus()).run();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ToolbarButton label={t('moreFormatting')} className="toolbar-panel-trigger">
          <Type />
          <ChevronDown className="size-3! opacity-60" />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('formatPanelLabel')}
        align="start"
        className="w-[min(23rem,calc(100vw-1rem))] p-3"
        onInteractOutside={keepNestedOverlayOpen}
        onFocusOutside={keepNestedOverlayOpen}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        onMouseDown={keepEditorFocus}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FontPicker
              value={state.fontFamily}
              triggerClassName="h-9 min-w-0 flex-1"
              onChange={(value) => {
                focus.markPicked();
                onOpenChange(false);
                if (value === '') editor.chain().focus().unsetFontFamily().run();
                else editor.chain().focus().setFontFamily(value).run();
              }}
            />
            {!regular ? (
              <Select
                value={state.fontSize}
                onValueChange={(value) => {
                  focus.markPicked();
                  onOpenChange(false);
                  editor.chain().focus().setMark('textStyle', { fontSize: value }).run();
                }}
              >
                <SelectTrigger className="toolbar-select w-[4.25rem] tabular-nums" aria-label={t('toolbarFontSize')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  onCloseAutoFocus={(event) => {
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
            ) : null}
          </div>
          {/* This popover only renders while some marks are off the main row. */}
          <div className="flex items-center gap-0.5" role="group" aria-label={t('formatTabText')}>
            {!regular ? (
              <ToolbarButton
                label={t('toolbarUnderline')}
                shortcut={SHORTCUTS.underline}
                pressed={state.underline}
                onClick={() => pick((chain) => chain.toggleUnderline())}
              >
                <Underline />
              </ToolbarButton>
            ) : null}
            <ToolbarButton
              label={t('toolbarStrikethrough')}
              shortcut={SHORTCUTS.strike}
              pressed={state.strike}
              onClick={() => pick((chain) => chain.toggleStrike())}
            >
              <Strikethrough />
            </ToolbarButton>
            <ToolbarButton
              label={t('toolbarInlineCode')}
              shortcut={SHORTCUTS.code}
              pressed={state.code}
              onClick={() => pick((chain) => chain.toggleCode())}
            >
              <Code />
            </ToolbarButton>
            <ToolbarButton
              label={t('toolbarSuperscript')}
              shortcut={SHORTCUTS.superscript}
              pressed={state.superscript}
              onClick={() => pick((chain) => chain.toggleSuperscript())}
            >
              <Superscript />
            </ToolbarButton>
            <ToolbarButton
              label={t('toolbarSubscript')}
              shortcut={SHORTCUTS.subscript}
              pressed={state.subscript}
              onClick={() => pick((chain) => chain.toggleSubscript())}
            >
              <Subscript />
            </ToolbarButton>
            <ToolbarButton
              label={t('toolbarClearFormatting')}
              onClick={() => pick((chain) => chain.unsetAllMarks().clearNodes())}
            >
              <RemoveFormatting />
            </ToolbarButton>
          </div>
          <PopoverSection title={t('toolbarHighlight')}>
            <ColorSwatchGrid
              editor={editor}
              kind="highlight"
              colors={HIGHLIGHT_COLORS}
              current={state.highlightColor}
              onPick={() => {
                focus.markPicked();
                onOpenChange(false);
              }}
            />
          </PopoverSection>
          {!wide ? (
            <PopoverSection title={t('paragraphAlignment')}>
              <div className="flex items-center gap-0.5" role="group" aria-label={t('paragraphAlignment')}>
                {ALIGNMENTS.map(({ value, label, icon: Icon }) => (
                  <ToolbarButton
                    key={value}
                    label={t(label)}
                    pressed={state.alignment === value}
                    onClick={() => pick((chain) => chain.setTextAlign(value))}
                  >
                    <Icon />
                  </ToolbarButton>
                ))}
              </div>
            </PopoverSection>
          ) : null}
          <PopoverSection title={t('toolbarLineSpacing')}>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t('toolbarLineSpacing')}>
              {[{ name: t('fontDefault'), value: '' }, ...lineSpacings].map((option) => (
                <button
                  key={option.value || 'default'}
                  type="button"
                  className="toolbar-chip h-8 min-h-8 px-2.5 text-xs"
                  aria-pressed={state.lineHeight === option.value}
                  onClick={() =>
                    pick((chain) =>
                      chain.setMark('textStyle', { lineHeight: option.value || null }).removeEmptyTextStyle(),
                    )
                  }
                >
                  {option.name}
                </button>
              ))}
            </div>
          </PopoverSection>
          <PopoverSection title={t('paragraphIndent')}>
            <div className="flex items-center gap-0.5" role="group" aria-label={t('paragraphIndent')}>
              <ToolbarButton
                label={t('toolbarDecreaseIndent')}
                shortcut={SHORTCUTS.outdent}
                disabled={!state.canOutdent}
                onClick={() => pick((chain) => chain.liftListItem('listItem'))}
              >
                <IndentDecrease className="rtl:-scale-x-100" />
              </ToolbarButton>
              <ToolbarButton
                label={t('toolbarIncreaseIndent')}
                shortcut={SHORTCUTS.indent}
                disabled={!state.canIndent}
                onClick={() => pick((chain) => chain.sinkListItem('listItem'))}
              >
                <IndentIncrease className="rtl:-scale-x-100" />
              </ToolbarButton>
            </div>
          </PopoverSection>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Insertions stay one labeled grid until the viewport has room for icons. */
function InsertPopover({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const focus = useReturnToEditor(editor);
  const complete = () => {
    focus.markPicked();
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ToolbarButton label={t('insertPanelToggle')} className="toolbar-panel-trigger">
          <Plus />
          <ChevronDown className="size-3! opacity-60" />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('insertPanelToggle')}
        align="start"
        className="w-[min(22rem,calc(100vw-1rem))] p-2"
        onInteractOutside={keepNestedOverlayOpen}
        onFocusOutside={keepNestedOverlayOpen}
        onCloseAutoFocus={focus.onCloseAutoFocus}
        onMouseDown={keepEditorFocus}
      >
        <div className="grid grid-cols-5 gap-1">
          <LinkPopover
            editor={editor}
            onComplete={complete}
            trigger={
              <ToolTile
                icon={<Link />}
                label={t('insertLinkShort')}
                aria-label={t('toolbarLink')}
              />
            }
          />
          <ImageToolbar editor={editor} variant="tile" onComplete={complete} />
          <TableGridPicker editor={editor} variant="tile" onComplete={complete} />
          <SmartGraphicGallery editor={editor} variant="tile" onComplete={complete} />
          <ToolTile
            icon={<SeparatorHorizontal />}
            label={t('insertDividerShort')}
            aria-label={t('toolbarHorizontalRule')}
            onClick={() => {
              focus.markPicked();
              onOpenChange(false);
              editor.chain().focus().setHorizontalRule().run();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
      <DropdownMenuContent align="start" className="min-w-52" onCloseAutoFocus={focus.onCloseAutoFocus}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {/* Blocks with different alignments: nothing is checked. */}
        <DropdownMenuRadioGroup
          value={value ?? ''}
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