import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/components/locale-provider';
import { formatMessage } from '@/lib/translations';
import { TableGridPicker } from './TableGridPicker';

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
  '#FFFFFF',
];

interface TableToolbarProps {
  editor: Editor;
}

export function TableToolbar({ editor }: TableToolbarProps) {
  const { t } = useLocale();
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
    }),
  });

  return (
    <div className="flex items-center gap-0.5">
      <TableGridPicker editor={editor} />
      {tableState.inTable ? (
        <>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    aria-label={t('tableTools')}
                  >
                    <TableProperties className="h-4 w-4" />
                    <span className="hidden sm:inline max-w-[4.5rem] truncate">{t('tableTools')}</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('tableTools')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-56 bg-popover border border-border shadow-lg z-50">
              <DropdownMenuLabel>{t('tableInsertGroup')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!tableState.canAddRowBefore}
                onSelect={() => editor.chain().focus().addRowBefore().run()}
              >
                <Rows3 className="mr-2 h-4 w-4" />
                {t('tableInsertRowAbove')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddRowAfter}
                onSelect={() => editor.chain().focus().addRowAfter().run()}
              >
                <Rows3 className="mr-2 h-4 w-4" />
                {t('tableInsertRowBelow')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddColumnBefore}
                onSelect={() => editor.chain().focus().addColumnBefore().run()}
              >
                <Columns3 className="mr-2 h-4 w-4" />
                {t('tableInsertColLeft')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddColumnAfter}
                onSelect={() => editor.chain().focus().addColumnAfter().run()}
              >
                <Columns3 className="mr-2 h-4 w-4" />
                {t('tableInsertColRight')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('tableDeleteGroup')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!tableState.canDeleteRow}
                onSelect={() => editor.chain().focus().deleteRow().run()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('tableDeleteRow')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canDeleteColumn}
                onSelect={() => editor.chain().focus().deleteColumn().run()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('tableDeleteColumn')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canDeleteTable}
                onSelect={() => editor.chain().focus().deleteTable().run()}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('tableDeleteTable')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!tableState.canMergeCells}
                onSelect={() => editor.chain().focus().mergeCells().run()}
              >
                <Combine className="mr-2 h-4 w-4" />
                {t('tableMergeCells')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canSplitCell}
                onSelect={() => editor.chain().focus().splitCell().run()}
              >
                <SquareSplitHorizontal className="mr-2 h-4 w-4" />
                {t('tableSplitCell')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!tableState.canToggleHeaderRow}
                onSelect={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                <PanelTop className="mr-2 h-4 w-4" />
                {t('tableHeaderRowToggle')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canToggleHeaderColumn}
                onSelect={() => editor.chain().focus().toggleHeaderColumn().run()}
              >
                <PanelLeft className="mr-2 h-4 w-4" />
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
                <Square className="mr-2 h-4 w-4" />
                {tableState.bordersHidden ? t('tableBordersVisible') : t('tableBordersHidden')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('tableCellFill')}>
                    <PaintBucket className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('tableCellFill')}</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-auto p-3 bg-popover border border-border shadow-lg z-50">
              <div className="grid grid-cols-5 gap-1.5">
                {CELL_FILL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="h-6 w-6 rounded-md border border-border/50 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring"
                    style={{ backgroundColor: color }}
                    aria-label={formatMessage(t('tableSetCellFill'), { color })}
                    onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', color).run()}
                  />
                ))}
                <button
                  type="button"
                  className="h-6 w-6 rounded-md border border-border/50 bg-background relative after:content-['×'] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-muted-foreground"
                  aria-label={t('tableClearFill')}
                  onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', null).run()}
                />
              </div>
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </div>
  );
}
