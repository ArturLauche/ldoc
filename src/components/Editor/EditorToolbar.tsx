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
import { t, type Locale } from '@/lib/translations';
import type { SmartDiagramTemplate } from './SmartDiagram';


interface EditorToolbarProps {
  editor: Editor | null;
  locale: Locale;
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

const highlightColors = [
  '#FEF08A', '#FDE68A', '#FECACA', '#D1FAE5', '#CFFAFE', '#DDD6FE',
  '#FBCFE8', '#FED7AA', '#E0E7FF', '#CCE5FF', '#TRANSPARENT',
];

const lineSpacings = [
  { name: 'Single', value: '1' },
  { name: '1.15', value: '1.15' },
  { name: '1.5', value: '1.5' },
  { name: 'Double', value: '2' },
];


const normalizeDiagramItems = (value: string) =>
  Array.from(
    new Set(
      value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);

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

export const EditorToolbar = ({ editor, locale }: EditorToolbarProps) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [tableRows, setTableRows] = useState('3');
  const [tableCols, setTableCols] = useState('3');
  const [tableWithHeader, setTableWithHeader] = useState(true);
  const [diagramTitle, setDiagramTitle] = useState(() => t(locale, 'toolbarDefaultDiagramTitle'));
  const [diagramTemplate, setDiagramTemplate] = useState<SmartDiagramTemplate>('process');
  const [diagramItems, setDiagramItems] = useState(() => t(locale, 'toolbarDefaultDiagramItems'));

  const setLink = useCallback(() => {
    if (!editor) return;
    
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setLinkUrl('');
  }, [editor, linkUrl]);

  const isInTable = editor?.isActive('table') ?? false;
  const isInDiagram = editor?.isActive('smartDiagram') ?? false;

  const createTable = () => {
    if (!editor) return;
    const rows = Math.max(1, Math.min(12, Number.parseInt(tableRows, 10) || 3));
    const cols = Math.max(1, Math.min(8, Number.parseInt(tableCols, 10) || 3));
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: tableWithHeader }).run();
  };

  const parsedTableRows = Number.parseInt(tableRows, 10);
  const parsedTableCols = Number.parseInt(tableCols, 10);
  const normalizedTableRows = Number.isFinite(parsedTableRows) ? Math.max(1, Math.min(12, parsedTableRows)) : 3;
  const normalizedTableCols = Number.isFinite(parsedTableCols) ? Math.max(1, Math.min(8, parsedTableCols)) : 3;
  const tableSizeWasAdjusted = parsedTableRows !== normalizedTableRows || parsedTableCols !== normalizedTableCols;

  const tablePresets = useMemo(() => ([
    { label: t(locale, 'toolbarPresetBasicGrid'), rows: '3', cols: '3', withHeader: true },
    { label: t(locale, 'toolbarPresetComparison'), rows: '4', cols: '4', withHeader: true },
    { label: t(locale, 'toolbarPresetAgenda'), rows: '5', cols: '3', withHeader: true },
    { label: t(locale, 'toolbarPresetMatrix'), rows: '4', cols: '5', withHeader: false },
  ]), [locale]);

  const diagramItemList = useMemo(() => normalizeDiagramItems(diagramItems), [diagramItems]);
  const diagramItemsValue = diagramItemList.join('|');
  const diagramLimitReached = diagramItemList.length >= 8;
  const canInsertDiagram = diagramItemList.length >= 2;

  useEffect(() => {
    if (!editor) return;

    const syncDiagramSelection = () => {
      if (!editor.isActive('smartDiagram')) return;
      const attrs = editor.getAttributes('smartDiagram');
      setDiagramTemplate((attrs.template as SmartDiagramTemplate) || 'process');
      setDiagramTitle(attrs.title || t(locale, 'toolbarDefaultDiagramTitle'));
      setDiagramItems(String(attrs.items || '').split('|').join('\n'));
    };

    syncDiagramSelection();
    editor.on('selectionUpdate', syncDiagramSelection);
    editor.on('transaction', syncDiagramSelection);

    return () => {
      editor.off('selectionUpdate', syncDiagramSelection);
      editor.off('transaction', syncDiagramSelection);
    };
  }, [editor, locale]);

  const insertDiagram = () => {
    if (!editor || !canInsertDiagram) return;
    editor
      .chain()
      .focus()
      .insertSmartDiagram({
        template: diagramTemplate,
        title: diagramTitle.trim() || t(locale, 'toolbarDefaultDiagramTitle'),
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
        title: diagramTitle.trim() || t(locale, 'toolbarDefaultDiagramTitle'),
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
          tooltip="Undo"
          shortcut="⌘Z"
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          tooltip="Redo"
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
        onValueChange={(value) => {
          editor.chain().focus().setMark('textStyle', { fontSize: value }).run();
        }}
      >
        <SelectTrigger className="w-16 h-8 text-xs font-medium bg-background/50 border-border/50" aria-label="Font size">
          <SelectValue placeholder="16" />
        </SelectTrigger>
        <SelectContent>
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
          tooltip="Bold"
          shortcut="⌘B"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          tooltip="Italic"
          shortcut="⌘I"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          tooltip="Underline"
          shortcut="⌘U"
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          tooltip="Strikethrough"
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
          tooltip="Superscript"
        >
          <Superscript className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          isActive={editor.isActive('subscript')}
          tooltip="Subscript"
        >
          <Subscript className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Text Color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Text color">
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
                aria-label={`Set text color to ${color}`}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Highlight */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Highlight color">
            <Highlighter className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 bg-popover border border-border shadow-lg z-50">
          <div className="grid grid-cols-6 gap-1.5">
            {highlightColors.map((color, index) => (
              <button
                key={index}
                onClick={() => {
                  if (color === '#TRANSPARENT') {
                    editor.chain().focus().unsetHighlight().run();
                  } else {
                    editor.chain().focus().setHighlight({ color }).run();
                  }
                }}
                className={cn(
                  "h-6 w-6 rounded-md border border-border/50 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring",
                  color === '#TRANSPARENT' && "bg-background relative after:content-['×'] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-muted-foreground"
                )}
                style={{ backgroundColor: color === '#TRANSPARENT' ? undefined : color }}
                aria-label={color === '#TRANSPARENT' ? 'Remove highlight' : `Set highlight to ${color}`}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear Formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        tooltip="Clear formatting"
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolbarButton>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Lists */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          tooltip="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          tooltip="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Indentation */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          tooltip="Decrease indent"
        >
          <IndentDecrease className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          tooltip="Increase indent"
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
          tooltip="Align left"
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          tooltip="Align center"
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          tooltip="Align right"
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          tooltip="Justify"
        >
          <AlignJustify className="h-4 w-4" />
        </ToolbarButton>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* Line Spacing */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Line spacing">
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
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Insert table">
            <TableIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3 bg-popover border border-border shadow-lg z-50">
          <div className="space-y-3">
            <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t(locale, 'toolbarCreateTable')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={tableRows}
                  onChange={(e) => setTableRows(e.target.value)}
                  aria-label={t(locale, 'toolbarRows')}
                  placeholder={t(locale, 'toolbarRows')}
                />
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={tableCols}
                  onChange={(e) => setTableCols(e.target.value)}
                  aria-label={t(locale, 'toolbarColumns')}
                  placeholder={t(locale, 'toolbarColumns')}
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
                {tableWithHeader ? t(locale, 'toolbarHeaderRowOn') : t(locale, 'toolbarHeaderRowOff')}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Table size: {normalizedTableRows} × {normalizedTableCols}
                {tableSizeWasAdjusted ? ' (adjusted to allowed range)' : ''}
              </p>
              <Button size="sm" className="w-full" onClick={createTable}>
                <Rows3 className="h-4 w-4 mr-2" /> {t(locale, 'toolbarInsertTable')}
              </Button>
            </div>

            <Separator />

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t(locale, 'toolbarTableTools')}</p>
              <div className="grid grid-cols-2 gap-1">
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarAddRowBefore')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarAddRowAfter')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarAddColumnBefore')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarAddColumnAfter')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().mergeCells().run()} disabled={!isInTable}>
                  <Combine className="h-4 w-4 mr-1" /> {t(locale, 'toolbarMergeCells')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().splitCell().run()} disabled={!isInTable}>
                  <SplitSquareHorizontal className="h-4 w-4 mr-1" /> {t(locale, 'toolbarSplitCell')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().toggleHeaderRow().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarToggleHeaderRow')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().toggleHeaderColumn().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarToggleHeaderColumn')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarDeleteRow')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!isInTable}>
                  {t(locale, 'toolbarDeleteColumn')}
                </Button>
              </div>
              <Button size="sm" variant="destructive" className="w-full mt-2" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!isInTable}>
                {t(locale, 'toolbarDeleteTable')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Smart diagram */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Insert smart diagram">
            <Workflow className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-popover border border-border shadow-lg z-50">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t(locale, 'toolbarDiagram')}</p>
            <Input
              value={diagramTitle}
              onChange={(e) => setDiagramTitle(e.target.value)}
              placeholder={t(locale, 'toolbarDiagramTitle')}
              aria-label={t(locale, 'toolbarDiagramTitle')}
            />
            <Select
              value={diagramTemplate}
              onValueChange={(value) => setDiagramTemplate(value as 'process' | 'cycle' | 'hierarchy')}
            >
              <SelectTrigger aria-label={t(locale, 'toolbarDiagramTemplate')}>
                <SelectValue placeholder={t(locale, 'toolbarDiagramTemplate')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="process">{t(locale, 'toolbarProcess')}</SelectItem>
                <SelectItem value="cycle">{t(locale, 'toolbarCycle')}</SelectItem>
                <SelectItem value="hierarchy">{t(locale, 'toolbarHierarchy')}</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              rows={5}
              value={diagramItems}
              onChange={(e) => setDiagramItems(e.target.value)}
              placeholder={t(locale, 'toolbarDiagramItems')}
              aria-label={t(locale, 'toolbarDiagramItems')}
            />
            <Button
              size="sm"
              variant="ghost"
              className="w-full justify-start text-xs"
              onClick={() => setDiagramItems(diagramItemList.join('\n'))}
            >
              Normalize list (trim + remove duplicates)
            </Button>
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span>{t(locale, 'toolbarDiagramHint')}</span>
                <span>{diagramItemList.length}/8</span>
              </div>
              {diagramLimitReached && <p className="mt-1">{t(locale, 'toolbarDiagramHintOverflow')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={insertDiagram} disabled={!canInsertDiagram}>{t(locale, 'toolbarInsertDiagram')}</Button>
              <Button size="sm" variant="outline" onClick={updateDiagram} disabled={!isInDiagram || !canInsertDiagram}>
                {t(locale, 'toolbarUpdateDiagram')}
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
            aria-label="Insert link"
          >
            <Link className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 bg-popover border border-border shadow-lg z-50">
          <div className="flex flex-col gap-2">
            <input
              type="url"
              placeholder="Enter URL..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setLink();
                }
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={setLink} className="flex-1">
                Apply
              </Button>
              {editor.isActive('link') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => editor.chain().focus().unsetLink().run()}
                >
                  Remove
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
        <SelectTrigger className="w-28 h-8 text-xs font-medium bg-background/50 border-border/50" aria-label="Text style">
          <Type className="h-3.5 w-3.5 mr-1.5" />
          <SelectValue placeholder="Style" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="paragraph">Normal</SelectItem>
          <SelectItem value="h1">Heading 1</SelectItem>
          <SelectItem value="h2">Heading 2</SelectItem>
          <SelectItem value="h3">Heading 3</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
