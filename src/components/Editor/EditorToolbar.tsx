import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Superscript,
  Subscript,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Link,
  RemoveFormatting,
  IndentDecrease,
  IndentIncrease,
  Type,
  Palette,
  Highlighter,
  ChevronsUpDown,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { keepEditorFocus } from '@/lib/inputModality';
import { FontPicker } from './FontPicker';
import { ImageToolbar } from './ImageToolbar';
import { SmartGraphicGallery } from './SmartGraphicGallery';
import { SmartGraphicToolbar } from './SmartGraphicToolbar';
import { TableGridPicker } from './TableGridPicker';
import { TableToolbar } from './TableToolbar';
import { ColorSwatchGrid, LinkPopover } from './toolbarControls';
import {
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  TEXT_BLOCK_STYLES,
  TEXT_COLORS,
  applyTextBlockStyle,
  useLineSpacings,
  useToolbarState,
  type TextBlockStyle,
} from './toolbarModel';
import { useLocale } from '@/hooks/useLocale';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface EditorToolbarProps {
  editor: Editor | null;
  /**
   * Free space in the header row. On one-row desktop toolbars, contextual
   * table/graphic tools render there so entering a table never wraps the
   * toolbar and shifts the document.
   */
  contextSlot?: HTMLElement | null;
}

const ToolbarButton = ({
  onClick,
  isActive,
  disabled = false,
  children,
  tooltip,
  shortcut,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  tooltip: string;
  shortcut?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className={cn('h-9 w-9 p-0 transition-colors', isActive && 'bg-primary/10 text-primary')}
        aria-label={tooltip}
        aria-pressed={isActive}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom" className="flex items-center gap-2">
      <span>{tooltip}</span>
      {shortcut && (
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </TooltipContent>
  </Tooltip>
);

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

  if (!editor || !state) return null;

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
      className="editor-toolbar"
      role="group"
      aria-label={t('formattingToolbar')}
      // Buttons keep the editor's selection (and a touch keyboard) in place.
      onMouseDown={keepEditorFocus}
    >
      <div className="toolbar-primary">
        <div className="flex items-center gap-1">
          {/* Styles (Headings) */}
          <Select
            value={state.blockStyle}
            onValueChange={(value) => applyTextBlockStyle(editor, value as TextBlockStyle)}
          >
            <SelectTrigger
              className="w-28 h-9 text-xs font-medium bg-card border-border"
              aria-label={t('toolbarTextStyle')}
            >
              <Type className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue placeholder={t('toolbarTextStyle')} />
            </SelectTrigger>
            <SelectContent
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                editor.commands.focus();
              }}
            >
              {TEXT_BLOCK_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  {t(style.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FontPicker
            value={state.fontFamily}
            onChange={(value) => {
              if (value === '') {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(value).run();
              }
            }}
          />

          {/* Font Size */}
          <Select
            value={state.fontSize}
            onValueChange={(value) => {
              // With a collapsed cursor the mark is stored, so the next typed
              // characters pick up the requested size.
              editor.chain().focus().setMark('textStyle', { fontSize: value }).run();
            }}
          >
            <SelectTrigger
              className="w-16 h-9 text-xs font-medium bg-card border-border"
              aria-label={t('toolbarFontSize')}
            >
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
                <SelectItem key={size} value={size}>
                  {Number.parseInt(size, 10)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Separator orientation="vertical" className="toolbar-separator h-6 mx-1" />
        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!state.canUndo}
            tooltip={t('toolbarUndo')}
            shortcut="⌘Z"
          >
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!state.canRedo}
            tooltip={t('toolbarRedo')}
            shortcut="⌘⇧Z"
          >
            <Redo className="h-4 w-4" />
          </ToolbarButton>
        </div>
        <Separator orientation="vertical" className="toolbar-separator h-6 mx-1" />
        {/* Text Formatting */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={state.bold}
            tooltip={t('toolbarBold')}
            shortcut="⌘B"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={state.italic}
            tooltip={t('toolbarItalic')}
            shortcut="⌘I"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={state.underline}
            tooltip={t('toolbarUnderline')}
            shortcut="⌘U"
          >
            <Underline className="h-4 w-4" />
          </ToolbarButton>
        </div>
        <Separator orientation="vertical" className="toolbar-separator h-6 mx-1" />
        {/* Lists */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={state.bulletList}
            tooltip={t('toolbarBulletList')}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={state.orderedList}
            tooltip={t('toolbarOrderedList')}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
        </div>
        {/* Contextual tools stay visible on tablets even while the secondary
            row is collapsed; wide screens show them in the header row. */}
        {contextTools && wide && contextSlot
          ? createPortal(contextTools, contextSlot)
          : contextTools}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 xl:hidden"
          aria-label={t(expanded ? 'lessFormatting' : 'moreFormatting')}
          aria-expanded={expanded}
          aria-controls="secondary-formatting"
          onClick={() => setExpanded((value) => !value)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
      <div id="secondary-formatting" className={cn('toolbar-secondary', expanded && 'is-expanded')}>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={state.strike}
          tooltip={t('toolbarStrikethrough')}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        {/* Superscript/Subscript */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            isActive={state.superscript}
            tooltip={t('toolbarSuperscript')}
          >
            <Superscript className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            isActive={state.subscript}
            tooltip={t('toolbarSubscript')}
          >
            <Subscript className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Text Color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              aria-label={t('toolbarTextColor')}
            >
              <Palette className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label={t('toolbarTextColor')}
            className="w-auto p-3 bg-popover border border-border shadow-lg z-50"
          >
            <ColorSwatchGrid editor={editor} kind="text" colors={TEXT_COLORS} />
          </PopoverContent>
        </Popover>

        {/* Highlight */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              aria-label={t('toolbarHighlight')}
            >
              <Highlighter className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label={t('toolbarHighlight')}
            className="w-auto p-3 bg-popover border border-border shadow-lg z-50"
          >
            <ColorSwatchGrid editor={editor} kind="highlight" colors={HIGHLIGHT_COLORS} />
          </PopoverContent>
        </Popover>

        {/* Clear Formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          tooltip={t('toolbarClearFormatting')}
        >
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarButton>
        <Separator orientation="vertical" className="toolbar-separator h-6 mx-1" />
        {/* Indentation */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
            tooltip={t('toolbarDecreaseIndent')}
            disabled={!state.canOutdent}
          >
            <IndentDecrease className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
            tooltip={t('toolbarIncreaseIndent')}
            disabled={!state.canIndent}
          >
            <IndentIncrease className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Alignment */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={state.alignment === 'left'}
            tooltip={t('toolbarAlignLeft')}
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={state.alignment === 'center'}
            tooltip={t('toolbarAlignCenter')}
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={state.alignment === 'right'}
            tooltip={t('toolbarAlignRight')}
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            isActive={state.alignment === 'justify'}
            tooltip={t('toolbarAlignJustify')}
          >
            <AlignJustify className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Line Spacing */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0"
              aria-label={t('toolbarLineSpacing')}
            >
              <ChevronsUpDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label={t('toolbarLineSpacing')}
            className="w-32 p-2 bg-popover border border-border shadow-lg z-50"
          >
            {lineSpacings.map((spacing) => (
              <Button
                key={spacing.value}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => {
                  editor.chain().focus().setMark('textStyle', { lineHeight: spacing.value }).run();
                }}
              >
                {spacing.name}
              </Button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Link */}
        <LinkPopover
          editor={editor}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-9 w-9 p-0', state.link && 'bg-primary/10 text-primary')}
              aria-label={t('toolbarLink')}
            >
              <Link className="h-4 w-4" />
            </Button>
          }
        />

        {/* Image */}
        <ImageToolbar editor={editor} />

        <TableGridPicker editor={editor} />
        <SmartGraphicGallery editor={editor} />
      </div>
    </div>
  );
});
