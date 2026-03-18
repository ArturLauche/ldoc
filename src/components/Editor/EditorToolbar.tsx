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
import { useCallback, useState } from 'react';
import { FontPicker } from './FontPicker';
import { ImageToolbar } from './ImageToolbar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';


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
  const [linkUrl, setLinkUrl] = useState('');
  const [tableRows, setTableRows] = useState('3');
  const [tableCols, setTableCols] = useState('3');
  const [tableWithHeader, setTableWithHeader] = useState(true);
  const [diagramTitle, setDiagramTitle] = useState('Process');
  const [diagramTemplate, setDiagramTemplate] = useState<'process' | 'cycle' | 'hierarchy'>('process');
  const [diagramItems, setDiagramItems] = useState('Idee\nReview\nRelease');

  const setLink = useCallback(() => {
    if (!editor) return;
    
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setLinkUrl('');
  }, [editor, linkUrl]);

  if (!editor) return null;
  const isInTable = editor.isActive('table');
  const isInDiagram = editor.isActive('smartDiagram');

  const createTable = () => {
    const rows = Math.max(1, Math.min(12, Number.parseInt(tableRows, 10) || 3));
    const cols = Math.max(1, Math.min(8, Number.parseInt(tableCols, 10) || 3));
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: tableWithHeader }).run();
  };

  const insertDiagram = () => {
    const items = diagramItems
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .join('|');
    editor
      .chain()
      .focus()
      .insertSmartDiagram({
        template: diagramTemplate,
        title: diagramTitle.trim() || 'Diagram',
        items,
      })
      .run();
  };

  const updateDiagram = () => {
    const items = diagramItems
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .join('|');
    editor
      .chain()
      .focus()
      .updateSmartDiagram({
        template: diagramTemplate,
        title: diagramTitle.trim() || 'Diagram',
        items,
      })
      .run();
  };

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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Create table</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={tableRows}
                  onChange={(e) => setTableRows(e.target.value)}
                  aria-label="Rows"
                  placeholder="Rows"
                />
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={tableCols}
                  onChange={(e) => setTableCols(e.target.value)}
                  aria-label="Columns"
                  placeholder="Columns"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setTableWithHeader((value) => !value)}
              >
                {tableWithHeader ? 'Header row: On' : 'Header row: Off'}
              </Button>
              <Button size="sm" className="w-full" onClick={createTable}>
                <Rows3 className="h-4 w-4 mr-2" /> Insert table
              </Button>
            </div>

            <Separator />

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Table tools</p>
              <div className="grid grid-cols-2 gap-1">
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!isInTable}>
                  + Row ↑
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!isInTable}>
                  + Row ↓
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!isInTable}>
                  + Col ←
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!isInTable}>
                  + Col →
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().mergeCells().run()} disabled={!isInTable}>
                  <Combine className="h-4 w-4 mr-1" /> Merge
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().splitCell().run()} disabled={!isInTable}>
                  <SplitSquareHorizontal className="h-4 w-4 mr-1" /> Split
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().toggleHeaderRow().run()} disabled={!isInTable}>
                  Header Row
                </Button>
                <Button size="sm" variant="ghost" className="justify-start" onClick={() => editor.chain().focus().toggleHeaderColumn().run()} disabled={!isInTable}>
                  Header Col
                </Button>
              </div>
              <Button size="sm" variant="destructive" className="w-full mt-2" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!isInTable}>
                Delete Table
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Smart diagram</p>
            <Input
              value={diagramTitle}
              onChange={(e) => setDiagramTitle(e.target.value)}
              placeholder="Diagram title"
              aria-label="Diagram title"
            />
            <Select
              value={diagramTemplate}
              onValueChange={(value) => setDiagramTemplate(value as 'process' | 'cycle' | 'hierarchy')}
            >
              <SelectTrigger aria-label="Diagram template">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="process">Process</SelectItem>
                <SelectItem value="cycle">Cycle</SelectItem>
                <SelectItem value="hierarchy">Hierarchy</SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              rows={4}
              value={diagramItems}
              onChange={(e) => setDiagramItems(e.target.value)}
              placeholder={'One item per line'}
              aria-label="Diagram items"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={insertDiagram}>Insert</Button>
              <Button size="sm" variant="outline" onClick={updateDiagram} disabled={!isInDiagram}>
                Update selected
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
