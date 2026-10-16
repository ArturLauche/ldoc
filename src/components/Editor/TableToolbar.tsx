import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ChevronDown,
  Columns3,
  Combine,
  PaintBucket,
  PanelLeft,
  PanelTop,
  Rows3,
  Square,
  SquareSplitHorizontal,
  TableProperties,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocale } from '@/hooks/useLocale';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { TableGridPicker } from './TableGridPicker';
import { ColorIndicator, PopoverSection, ToolbarButton } from './toolbarControls';

const swatchClass = (selected: boolean) =>
  cn(
    'relative size-7 rounded-sm border border-foreground/15 bg-card transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:size-9',
    selected && 'ring-2 ring-selected ring-offset-1 ring-offset-popover',
  );

/** Fill of the cell at the selection (header or body cell). */
function cellBackground(editor: Editor): string | undefined {
  const value: unknown =
    editor.getAttributes('tableCell').backgroundColor ??
    editor.getAttributes('tableHeader').backgroundColor;
  return typeof value === 'string' && value ? value : undefined;
}

const CELL_FILL_COLORS = [
  '#FEF08A',
  '#FDE68A',
  '#FECACA',
  '#D1FAE5',
  '#CFFAFE',
  '#DDD6FE',
  '#FBCFE8',
  '#E0E7FF',
  '#F3F4F6',
];

interface TableToolbarProps {
  editor: Editor;
  /** Include the insert-table picker (the phone toolbar has its own). */
  showInsert?: boolean;
  /** Visible text labels for touch layouts, where tooltips do not appear. */
  showLabels?: boolean;
}

export function TableToolbar({ editor, showInsert = true, showLabels = false }: TableToolbarProps) {
  const { t } = useLocale();
  const toolsMenu = useTouchSafeMenu();
  const [fillOpen, setFillOpen] = useState(false);
  const tableState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      inTable: current.isActive('table'),
      canAddRowBefore: current.can().addRowBefore(),
      canAddRowAfter: current.can().addRowAfter(),
      canAddColumnBefore: current.can().addColumnBefore(),
      canAddColumnAfter: current.can().addColumnAfter(),
      canDeleteRow: current.can().deleteRow(),
      canDeleteColumn: current.can().deleteColumn(),
      canDeleteTable: current.can().deleteTable(),
      canMergeCells: current.can().mergeCells(),
      canSplitCell: current.can().splitCell(),
      canToggleHeaderRow: current.can().toggleHeaderRow(),
      canToggleHeaderColumn: current.can().toggleHeaderColumn(),
      bordersHidden: current.getAttributes('table').borders === 'hidden',
      cellFill: cellBackground(current),
    }),
  });

  const applyFill = (color: string | null) => {
    editor.chain().focus().setCellAttribute('backgroundColor', color).run();
    setFillOpen(false);
  };

  return (
    <div className={cn('flex max-w-full items-center gap-1', !showLabels && 'flex-wrap')}>
      {showInsert ? <TableGridPicker editor={editor} /> : null}
      {tableState.inTable ? (
        <>
          {/* Non-modal, so focus stays in the document after an action
              instead of being trapped and returned to the trigger. */}
          <DropdownMenu modal={false} open={toolsMenu.open} onOpenChange={toolsMenu.onOpenChange}>
            <DropdownMenuTrigger asChild {...toolsMenu.triggerProps}>
              <ToolbarButton
                label={t('tableTools')}
                size="sm"
                className={cn('h-9 gap-1.5 px-2', showLabels && 'h-10 px-3')}
              >
                <TableProperties />
                <span
                  className={cn(
                    'max-w-[4.5rem] truncate',
                    showLabels ? 'max-w-[8rem]' : 'hidden lg:inline',
                  )}
                >
                  {t('tableTools')}
                </span>
                <ChevronDown className="size-3.5! text-muted-foreground" />
              </ToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>{t('tableInsertGroup')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!tableState.canAddRowBefore}
                onSelect={() => editor.chain().focus().addRowBefore().run()}
              >
                <ArrowUpToLine />
                {t('tableInsertRowAbove')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddRowAfter}
                onSelect={() => editor.chain().focus().addRowAfter().run()}
              >
                <ArrowDownToLine />
                {t('tableInsertRowBelow')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddColumnBefore}
                onSelect={() => editor.chain().focus().addColumnBefore().run()}
              >
                <ArrowLeftToLine className="rtl:-scale-x-100" />
                {t('tableInsertColLeft')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddColumnAfter}
                onSelect={() => editor.chain().focus().addColumnAfter().run()}
              >
                <ArrowRightToLine className="rtl:-scale-x-100" />
                {t('tableInsertColRight')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!tableState.canMergeCells}
                onSelect={() => editor.chain().focus().mergeCells().run()}
              >
                <Combine />
                {t('tableMergeCells')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canSplitCell}
                onSelect={() => editor.chain().focus().splitCell().run()}
              >
                <SquareSplitHorizontal />
                {t('tableSplitCell')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!tableState.canToggleHeaderRow}
                onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                <PanelTop />
                {t('tableHeaderRowToggle')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canToggleHeaderColumn}
                onSelect={() => editor.chain().focus().toggleHeaderColumn().run()}
              >
                <PanelLeft className="rtl:-scale-x-100" />
                {t('tableHeaderColumnToggle')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('table', {
                      borders: tableState.bordersHidden ? 'visible' : 'hidden',
                    })
                    .run()
                }
              >
                <Square />
                {tableState.bordersHidden ? t('tableBordersVisible') : t('tableBordersHidden')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('tableDeleteGroup')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!tableState.canDeleteRow}
                onSelect={() => editor.chain().focus().deleteRow().run()}
              >
                <Rows3 />
                {t('tableDeleteRow')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canDeleteColumn}
                onSelect={() => editor.chain().focus().deleteColumn().run()}
              >
                <Columns3 />
                {t('tableDeleteColumn')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!tableState.canDeleteTable}
                onSelect={() => editor.chain().focus().deleteTable().run()}
              >
                <Trash2 />
                {t('tableDeleteTable')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover open={fillOpen} onOpenChange={setFillOpen}>
            <PopoverTrigger asChild>
              <ToolbarButton
                label={t('tableCellFill')}
                size={showLabels ? 'sm' : 'icon'}
                className={cn(showLabels && 'h-10 gap-1.5 px-3')}
              >
                <ColorIndicator color={tableState.cellFill}>
                  <PaintBucket className="size-3.5!" />
                </ColorIndicator>
                {showLabels ? <span className="max-w-[8rem] truncate">{t('tableCellFill')}</span> : null}
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent aria-label={t('tableCellFill')} className="w-auto p-3">
              <PopoverSection title={t('tableCellFill')}>
                <div className="grid grid-cols-6 gap-1.5">
                  <button
                    type="button"
                    className={swatchClass(!tableState.cellFill)}
                    aria-label={t('tableClearFill')}
                    aria-pressed={!tableState.cellFill}
                    onClick={() => applyFill(null)}
                  >
                    <span aria-hidden="true" className="absolute inset-[3px] rounded-[2px] bg-[linear-gradient(to_top_right,transparent_calc(50%-0.75px),hsl(var(--destructive))_calc(50%-0.75px),hsl(var(--destructive))_calc(50%+0.75px),transparent_calc(50%+0.75px))]" />
                  </button>
                  {CELL_FILL_COLORS.map((color) => {
                    const selected = tableState.cellFill?.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        className={swatchClass(selected)}
                        style={{ backgroundColor: color }}
                        aria-label={formatMessage(t('tableSetCellFill'), { color })}
                        aria-pressed={selected}
                        onClick={() => applyFill(color)}
                      />
                    );
                  })}
                </div>
              </PopoverSection>
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </div>
  );
}
