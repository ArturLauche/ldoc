import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Combine,
  PaintBucket,
  PanelLeft,
  PanelTop,
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
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLocale } from '@/components/locale-provider';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { TableGridPicker } from './TableGridPicker';

const CELL_FILL_COLORS = [
  '#FFFFFF',
  '#F3F4F6',
  '#FEE2E2',
  '#FFEDD5',
  '#FEF08A',
  '#DCFCE7',
  '#CFFAFE',
  '#DBEAFE',
  '#EDE9FE',
  '#FCE7F3',
];

interface TableToolbarProps {
  editor: Editor;
}

function TableToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
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
        <div
          className={cn(
            'flex items-center gap-0.5 rounded-md border border-border/70 bg-background/70 px-0.5',
          )}
        >
          <TableToolButton
            label={t('tableInsertRowBelow')}
            disabled={!tableState.canAddRowAfter}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            <BetweenHorizontalEnd className="h-4 w-4" />
          </TableToolButton>
          <TableToolButton
            label={t('tableInsertColRight')}
            disabled={!tableState.canAddColumnAfter}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            <BetweenVerticalEnd className="h-4 w-4" />
          </TableToolButton>
          <TableToolButton
            label={t('tableMergeCells')}
            disabled={!tableState.canMergeCells}
            onClick={() => editor.chain().focus().mergeCells().run()}
          >
            <Combine className="h-4 w-4" />
          </TableToolButton>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
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
            <PopoverContent align="start" className="w-auto p-2.5 bg-card border border-border shadow-md z-50">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">{t('tableCellFill')}</p>
              <div className="grid grid-cols-5 gap-1">
                {CELL_FILL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="h-6 w-6 rounded-[2px] border border-neutral-300 dark:border-neutral-600 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    style={{ backgroundColor: color }}
                    aria-label={formatMessage(t('tableSetCellFill'), { color })}
                    onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', color).run()}
                  />
                ))}
                <button
                  type="button"
                  className="h-6 w-6 rounded-[2px] border border-neutral-300 bg-background relative after:content-['×'] after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-xs after:text-muted-foreground dark:border-neutral-600"
                  aria-label={t('tableClearFill')}
                  onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', null).run()}
                />
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-1.5 text-xs"
                    aria-label={t('tableTools')}
                  >
                    <TableProperties className="h-4 w-4" />
                    <span className="hidden sm:inline max-w-[4.5rem] truncate">{t('tableTools')}</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('tableTools')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-56 bg-card border border-border shadow-md z-50">
              <DropdownMenuLabel>{t('tableInsertGroup')}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!tableState.canAddRowBefore}
                onSelect={() => editor.chain().focus().addRowBefore().run()}
              >
                <BetweenHorizontalEnd className="mr-2 h-4 w-4 rotate-180" />
                {t('tableInsertRowAbove')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddRowAfter}
                onSelect={() => editor.chain().focus().addRowAfter().run()}
              >
                <BetweenHorizontalEnd className="mr-2 h-4 w-4" />
                {t('tableInsertRowBelow')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddColumnBefore}
                onSelect={() => editor.chain().focus().addColumnBefore().run()}
              >
                <BetweenVerticalEnd className="mr-2 h-4 w-4 rotate-180" />
                {t('tableInsertColLeft')}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!tableState.canAddColumnAfter}
                onSelect={() => editor.chain().focus().addColumnAfter().run()}
              >
                <BetweenVerticalEnd className="mr-2 h-4 w-4" />
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
        </div>
      ) : null}
    </div>
  );
}
