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
  Table as TableIcon,
  Rows3,
  Workflow,
  SplitSquareHorizontal,
  Combine,
  Plus,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FontPicker } from './FontPicker';
import { ImageToolbar } from './ImageToolbar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
import type { SmartDiagramTemplate } from './SmartDiagram';

interface EditorToolbarProps {
  editor: Editor | null;
}

const fontSizes = [
  { name: '10', value: '10px' },
  { name: '12', value: '12px' },
  { name: '14', value: '14px' },
  { name: '16', value: '16px' },
  { name: '18', value: '18px' },
  { name: '20', value: '20px' },
  { name: '24', value: '24px' },
  { name: '28', value: '28px' },
  { name: '32', value: '32px' },
  { name: '36', value: '36px' },
  { name: '48', value: '48px' },
];

const textColors = [
  '#000000', '#374151', '#6B7280', '#DC2626', '#EA580C', '#CA8A04',
  '#16A34A', '#0EA5E9', '#2563EB', '#7C3AED', '#DB2777', '#FFFFFF',
];

const REMOVE_HIGHLIGHT = 'transparent';

const highlightColors = [
  '#FEF08A', '#FDE68A', '#FECACA', '#D1FAE5', '#CFFAFE', '#DDD6FE',
  '#FBCFE8', '#FED7AA', '#E0E7FF', '#CCE5FF', REMOVE_HIGHLIGHT,
];

const normalizeDiagramItems = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

const ToolbarButton = ({
  onClick,
  isActive = false,
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
        className={cn(
          'h-8 w-8 p-0 transition-all duration-200',
          isActive && 'bg-primary/10 text-primary'
        )}
        aria-label={tooltip}
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

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  const { t } = useLocale();
  const [linkUrl, setLinkUrl] = useState('');
  const [tableRows, setTableRows] = useState('3');
  const [tableCols, setTableCols] = useState('3');
  const [tableWithHeader, setTableWithHeader] = useState(true);
  const [diagramTitle, setDiagramTitle] = useState(() => t('toolbarDefaultDiagramTitle'));
  const [diagramTemplate, setDiagramTemplate] = useState<SmartDiagramTemplate>('process');
  const [diagramItems, setDiagramItems] = useState(() => t('toolbarDefaultDiagramItems'));
  const [activeFontSize, setActiveFontSize] = useState('16px');

  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setLinkUrl('');
  }, [editor, linkUrl]);

  const applyFontSize = useCallback(
    (value: string) => {
      if (!editor) return;
      // With a collapsed cursor the mark is stored, so the next typed
      // characters pick up the requested size.
      editor.chain().focus().setMark('textStyle', { fontSize: value }).run();
    },
    [editor],
  );


  const isInTable = editor?.isActive('table') ?? false;
  const isInDiagram = editor?.isActive('smartDiagram') ?? false;

  const createTable = () => {
    if (!editor) return;
    const rows = Math.max(1, Math.min(12, Number.parseInt(tableRows, 10) || 3));
    const cols = Math.max(1, Math.min(8, Number.parseInt(tableCols, 10) || 3));
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: tableWithHeader }).run();
  };

  const tablePresets = useMemo(() => ([
    { label: t('toolbarPresetBasicGrid'), rows: '3', cols: '3', withHeader: true },
    { label: t('toolbarPresetComparison'), rows: '4', cols: '4', withHeader: true },
    { label: t('toolbarPresetAgenda'), rows: '5', cols: '3', withHeader: true },
    { label: t('toolbarPresetMatrix'), rows: '4', cols: '5', withHeader: false },
  ]), [t]);

  const lineSpacings = useMemo(() => ([
    { name: t('toolbarSpacingSingle'), value: '1' },
    { name: '1.15', value: '1.15' },
    { name: '1.5', value: '1.5' },
    { name: t('toolbarSpacingDouble'), value: '2' },
  ]), [t]);

  const diagramItemList = useMemo(() => normalizeDiagramItems(diagramItems), [diagramItems]);
  const diagramItemsValue = diagramItemList.join('|');
  const diagramLimitReached = diagramItemList.length >= 8;
  const canInsertDiagram = diagramItemList.length >= 2;
  const tableSummary = `${Math.max(1, Math.min(12, Number.parseInt(tableRows, 10) || 3))}×${Math.max(1, Math.min(8, Number.parseInt(tableCols, 10) || 3))}`;

  useEffect(() => {
    if (!editor) return;

    const syncDiagramSelection = () => {
      if (!editor.isActive('smartDiagram')) return;
      const attrs = editor.getAttributes('smartDiagram');
      setDiagramTemplate((attrs.template as SmartDiagramTemplate) || 'process');
      setDiagramTitle(attrs.title || t('toolbarDefaultDiagramTitle'));
      setDiagramItems(String(attrs.items || '').split('|').join('\n'));
    };

    syncDiagramSelection();
    editor.on('selectionUpdate', syncDiagramSelection);
    editor.on('transaction', syncDiagramSelection);

    return () => {
      editor.off('selectionUpdate', syncDiagramSelection);
      editor.off('transaction', syncDiagramSelection);
    };
  }, [editor, t]);

  useEffect(() => {
    if (!editor) return;

    const syncFontSize = () => {
      // Stored marks hold the pending size for a collapsed cursor; without
      // them the dropdown would snap back to the default right after a change.
      const storedFontSize = editor.state.storedMarks?.find(
        (mark) => mark.type.name === 'textStyle',
      )?.attrs.fontSize;
      const fontSize = storedFontSize ?? editor.getAttributes('textStyle').fontSize;
      setActiveFontSize(typeof fontSize === 'string' && fontSize.length > 0 ? fontSize : '16px');
    };

    syncFontSize();
    editor.on('selectionUpdate', syncFontSize);
    editor.on('transaction', syncFontSize);

    return () => {
      editor.off('selectionUpdate', syncFontSize);
      editor.off('transaction', syncFontSize);
    };
  }, [editor]);

  const insertDiagram = () => {
    if (!editor || !canInsertDiagram) return;
    editor
      .chain()
      .focus()
      .insertSmartDiagram({
        template: diagramTemplate,
        title: diagramTitle.trim() || t('toolbarDefaultDiagramTitle'),
        items: diagramItemsValue,
      })
      .run();
  };

  const updateDiagram = () => {
    if (!editor || !canInsertDiagram) return;
    editor
      .chain()
      .focus()
      .updateSmartDiagram({
        template: diagramTemplate,
        title: diagramTitle.trim() || t('toolbarDefaultDiagramTitle'),
        items: diagramItemsValue,
      })
      .run();
  };

  if (!editor) return null;

  return (
    <div className="floating-toolbar flex flex-wrap items-center gap-1 p-2">
      {/* Undo/Redo */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          tooltip={t('toolbarUndo')}
          shortcut="⌘Z"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          tooltip={t('toolbarRedo')}
          shortcut="⌘⇧Z"
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Font Family - Using FontPicker */}
      <FontPicker
        value={editor.getAttributes('textStyle').fontFamily || ''}
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
        value={activeFontSize}
        onValueChange={(value) => {
          setActiveFontSize(value);
          applyFontSize(value);
        }}
      >
        <SelectTrigger
          className="w-16 h-8 text-xs font-medium bg-background/50 border-border/50"
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
          {fontSizes.map((size) => (
            <SelectItem key={size.value} value={size.value}>
              {size.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>


      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text Formatting */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          tooltip={t('toolbarBold')}
          shortcut="⌘B"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          tooltip={t('toolbarItalic')}
          shortcut="⌘I"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          tooltip={t('toolbarUnderline')}
          shortcut="⌘U"
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          tooltip={t('toolbarStrikethrough')}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Superscript/Subscript */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          isActive={editor.isActive('superscript')}
          tooltip={t('toolbarSuperscript')}
        >
          <Superscript className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          isActive={editor.isActive('subscript')}
          tooltip={t('toolbarSubscript')}
        >
          <Subscript className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text Color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('toolbarTextColor')}>
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 bg-popover border border-border shadow-lg z-50">
          <div className="grid grid-cols-6 gap-1.5">
            {textColors.map((color) => (
              <button
                key={color}
                onClick={() => editor.chain().focus().setColor(color).run()}
                className="h-6 w-6 rounded-md border border-border/50 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ backgroundColor: color }}
                aria-label={formatMessage(t('toolbarSetTextColor'), { color })}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Highlight */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('toolbarHighlight')}>
            <Highlighter className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 bg-popover border border-border shadow-lg z-50">
          <div className="grid grid-cols-6 gap-1.5">
            {highlightColors.map((color) => (
              <button
                key={color}
                onClick={() => {
                  if (color === REMOVE_HIGHLIGHT) {
                    editor.chain().focus().unsetHighlight().run();
                  } else {
                    editor.chain().focus().setHighlight({ color }).run();
                  }
                }}
                className={cn(
                  "h-6 w-6 rounded-md border border-border/50 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring",
                  color === REMOVE_HIGHLIGHT && "bg-background relative after:content-['×'] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-muted-foreground"
                )}
                style={{ backgroundColor: color === REMOVE_HIGHLIGHT ? undefined : color }}
                aria-label={
                  color === REMOVE_HIGHLIGHT
                    ? t('toolbarRemoveHighlight')
                    : formatMessage(t('toolbarSetHighlight'), { color })
                }
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear Formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        tooltip={t('toolbarClearFormatting')}
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          tooltip={t('toolbarBulletList')}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          tooltip={t('toolbarOrderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Indentation */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          tooltip={t('toolbarDecreaseIndent')}
        >
          <IndentDecrease className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          tooltip={t('toolbarIncreaseIndent')}
        >
          <IndentIncrease className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Alignment */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          tooltip={t('toolbarAlignLeft')}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          tooltip={t('toolbarAlignCenter')}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          tooltip={t('toolbarAlignRight')}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          tooltip={t('toolbarAlignJustify')}
        >
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Line Spacing */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('toolbarLineSpacing')}>
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-32 p-2 bg-popover border border-border shadow-lg z-50">
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

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Tables */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('toolbarTable')}>
            <TableIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 bg-popover border border-border shadow-lg z-50">
          <div className="space-y-3">
            <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('toolbarCreateTable')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={tableRows}
                  onChange={(e) => setTableRows(e.target.value)}
                  aria-label={t('toolbarRows')}
                  placeholder={t('toolbarRows')}
                />
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={tableCols}
                  onChange={(e) => setTableCols(e.target.value)}
                  aria-label={t('toolbarColumns')}
                  placeholder={t('toolbarColumns')}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tablePresets.map((preset) => (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant="secondary"
                    className="justify-start"
                    onClick={() => {
                      setTableRows(preset.rows);
                      setTableCols(preset.cols);
                      setTableWithHeader(preset.withHeader);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setTableWithHeader((value) => !value)}
              >
                {tableWithHeader ? t('toolbarHeaderRowOn') : t('toolbarHeaderRowOff')}
              </Button>
              <Button size="sm" className="w-full" onClick={createTable}>
                <Rows3 className="h-4 w-4 mr-2" /> {t('toolbarInsertTable')} ({tableSummary})
              </Button>
            </div>

            <Separator />

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('toolbarTableTools')}</p>
              <div className="grid grid-cols-2 gap-1">
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!isInTable}>
                  {t('toolbarAddRowBefore')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!isInTable}>
                  {t('toolbarAddRowAfter')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!isInTable}>
                  {t('toolbarAddColumnBefore')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!isInTable}>
                  {t('toolbarAddColumnAfter')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().mergeCells().run()} disabled={!isInTable}>
                  <Combine className="h-4 w-4 mr-1" /> {t('toolbarMergeCells')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().splitCell().run()} disabled={!isInTable}>
                  <SplitSquareHorizontal className="h-4 w-4 mr-1" /> {t('toolbarSplitCell')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().toggleHeaderRow().run()} disabled={!isInTable}>
                  {t('toolbarToggleHeaderRow')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().toggleHeaderColumn().run()} disabled={!isInTable}>
                  {t('toolbarToggleHeaderColumn')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!isInTable}>
                  {t('toolbarDeleteRow')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!isInTable}>
                  {t('toolbarDeleteColumn')}
                </Button>
              </div>
              <Button size="sm" variant="destructive" className="w-full mt-2" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!isInTable}>
                {t('toolbarDeleteTable')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Smart diagram */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('toolbarDiagram')}>
            <Workflow className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-popover border border-border shadow-lg z-50">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('toolbarDiagram')}</p>
            <Input
              value={diagramTitle}
              onChange={(e) => setDiagramTitle(e.target.value)}
              placeholder={t('toolbarDiagramTitle')}
              aria-label={t('toolbarDiagramTitle')}
            />
            <Select
              value={diagramTemplate}
              onValueChange={(value) => setDiagramTemplate(value as SmartDiagramTemplate)}
            >
              <SelectTrigger aria-label={t('toolbarDiagramTemplate')}>
                <SelectValue placeholder={t('toolbarDiagramTemplate')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="process">{t('toolbarProcess')}</SelectItem>
                <SelectItem value="cycle">{t('toolbarCycle')}</SelectItem>
                <SelectItem value="hierarchy">{t('toolbarHierarchy')}</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              rows={5}
              value={diagramItems}
              onChange={(e) => setDiagramItems(e.target.value)}
              placeholder={t('toolbarDiagramItems')}
              aria-label={t('toolbarDiagramItems')}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="justify-start"
                onClick={() =>
                  setDiagramItems(
                    (value) =>
                      `${value.trim()}\n${t('toolbarDiagramAutoItemLabel')} ${diagramItemList.length + 1}`.trim(),
                  )
                }
                disabled={diagramLimitReached}
              >
                <Plus className="h-4 w-4 mr-2" /> {t('toolbarDiagramAddItem')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="justify-start"
                onClick={() => setDiagramItems(diagramItemList.slice(0, -1).join('\n'))}
                disabled={diagramItemList.length <= 2}
              >
                <Minus className="h-4 w-4 mr-2" /> {t('toolbarDiagramRemoveItem')}
              </Button>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span>{t('toolbarDiagramHint')}</span>
                <span>{diagramItemList.length}/8</span>
              </div>
              {diagramLimitReached && <p className="mt-1">{t('toolbarDiagramHintOverflow')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={insertDiagram} disabled={!canInsertDiagram}>{t('toolbarInsertDiagram')}</Button>
              <Button size="sm" variant="outline" onClick={updateDiagram} disabled={!isInDiagram || !canInsertDiagram}>
                {t('toolbarUpdateDiagram')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Link */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-8 w-8 p-0', editor.isActive('link') && 'bg-primary/10 text-primary')}
            aria-label={t('toolbarLink')}
          >
            <Link className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-popover border border-border shadow-lg z-50">
          <div className="flex flex-col gap-2">
            <Input
              type="url"
              placeholder={t('toolbarLinkPlaceholder')}
              aria-label={t('toolbarLinkPlaceholder')}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="h-9"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setLink();
                }
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={setLink} className="flex-1">
                {t('toolbarLinkApply')}
              </Button>
              {editor.isActive('link') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => editor.chain().focus().unsetLink().run()}
                >
                  {t('toolbarLinkRemove')}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Image */}
      <ImageToolbar editor={editor} />

      {/* Styles (Headings) */}
      <Select
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1' :
          editor.isActive('heading', { level: 2 }) ? 'h2' :
          editor.isActive('heading', { level: 3 }) ? 'h3' :
          'paragraph'
        }
        onValueChange={(value) => {
          if (value === 'paragraph') {
            editor.chain().focus().setParagraph().run();
          } else {
            const level = parseInt(value.replace('h', '')) as 1 | 2 | 3;
            editor.chain().focus().toggleHeading({ level }).run();
          }
        }}
      >
        <SelectTrigger
          className="w-28 h-8 text-xs font-medium bg-background/50 border-border/50"
          aria-label={t('toolbarTextStyle')}
        >
          <Type className="h-3.5 w-3.5 mr-1.5" />
          <SelectValue placeholder={t('toolbarTextStyle')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">{t('toolbarStyleNormal')}</SelectItem>
          <SelectItem value="h1">{t('toolbarStyleH1')}</SelectItem>
          <SelectItem value="h2">{t('toolbarStyleH2')}</SelectItem>
          <SelectItem value="h3">{t('toolbarStyleH3')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
