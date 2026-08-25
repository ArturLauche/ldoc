import { useCallback, useEffect, useId, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
import { cn } from '@/lib/utils';

export const TABLE_PICKER_MAX = 10;
export const TABLE_CUSTOM_MAX = 20;

export interface TableInsertSpec {
  rows: number;
  cols: number;
  withHeaderRow: boolean;
}

interface TableGridPickerProps {
  editor: Editor;
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(TABLE_CUSTOM_MAX, Math.max(1, Math.round(value)));
}

function parseCustomSize(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return clampSize(parsed);
}

export function TableGridPicker({ editor }: TableGridPickerProps) {
  const { t } = useLocale();
  const gridId = useId();
  const [open, setOpen] = useState(false);
  const [hoverRows, setHoverRows] = useState(1);
  const [hoverCols, setHoverCols] = useState(1);
  const [withHeaderRow, setWithHeaderRow] = useState(true);
  const [customRows, setCustomRows] = useState('3');
  const [customCols, setCustomCols] = useState('3');

  useEffect(() => {
    if (!open) {
      setHoverRows(1);
      setHoverCols(1);
    }
  }, [open]);

  const insertTable = useCallback(
    (spec: TableInsertSpec) => {
      const rows = clampSize(spec.rows);
      const cols = clampSize(spec.cols);
      editor.chain().focus().insertTable({ rows, cols, withHeaderRow: spec.withHeaderRow }).run();
      setOpen(false);
    },
    [editor],
  );

  const moveHover = useCallback((rows: number, cols: number) => {
    setHoverRows(Math.min(TABLE_PICKER_MAX, Math.max(1, rows)));
    setHoverCols(Math.min(TABLE_PICKER_MAX, Math.max(1, cols)));
  }, []);

  const customRowCount = parseCustomSize(customRows);
  const customColCount = parseCustomSize(customCols);
  const canInsertCustom = customRowCount !== null && customColCount !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={t('toolbarInsertTable')}
              aria-haspopup="dialog"
            >
              <Table className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('toolbarInsertTable')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-auto p-2.5 bg-card text-card-foreground border border-border shadow-md z-50"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <p className="px-0.5 text-[11px] font-medium leading-none text-muted-foreground">
            {t('toolbarInsertTable')}
          </p>
          <div
            role="grid"
            id={gridId}
            tabIndex={0}
            aria-label={formatMessage(t('tablePickerSize'), { rows: hoverRows, cols: hoverCols })}
            className="w-fit outline-none"
            onMouseLeave={() => moveHover(1, 1)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveHover(hoverRows, hoverCols + 1);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveHover(hoverRows, hoverCols - 1);
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveHover(hoverRows + 1, hoverCols);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveHover(hoverRows - 1, hoverCols);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                insertTable({ rows: hoverRows, cols: hoverCols, withHeaderRow });
              }
            }}
          >
            <div className="grid w-fit grid-cols-10 gap-[2px]">
              {Array.from({ length: TABLE_PICKER_MAX }, (_, rowIndex) =>
                Array.from({ length: TABLE_PICKER_MAX }, (_, colIndex) => {
                  const row = rowIndex + 1;
                  const col = colIndex + 1;
                  const active = row <= hoverRows && col <= hoverCols;
                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      role="gridcell"
                      data-testid={`table-picker-cell-${row}-${col}`}
                      aria-label={formatMessage(t('tablePickerSize'), { rows: row, cols: col })}
                      aria-selected={active}
                      className={cn(
                        'h-[17px] w-[17px] rounded-[1px] border p-0 transition-colors duration-75',
                        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-600',
                        active
                          ? 'border-sky-600 bg-sky-200 dark:border-sky-400 dark:bg-sky-800'
                          : 'border-neutral-300 bg-background hover:border-sky-400 dark:border-neutral-600',
                      )}
                      onMouseEnter={() => moveHover(row, col)}
                      onFocus={() => moveHover(row, col)}
                      onClick={() => insertTable({ rows: row, cols: col, withHeaderRow })}
                    />
                  );
                }),
              )}
            </div>
          </div>
          <p className="text-center text-xs font-medium tabular-nums text-foreground">
            {formatMessage(t('tablePickerCaption'), { rows: hoverRows, cols: hoverCols })}
          </p>
          <label className="flex items-center gap-2 px-0.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={withHeaderRow}
              onChange={(event) => setWithHeaderRow(event.target.checked)}
              className="h-3.5 w-3.5 rounded-sm border-border accent-sky-600"
            />
            {t('tableHeaderRow')}
          </label>
          <div className="border-t border-border/80 pt-2">
            <p className="mb-1.5 px-0.5 text-[11px] font-medium leading-none text-muted-foreground">
              {t('tablePickerCustom')}
            </p>
            <div className="flex items-end gap-2">
              <div className="min-w-0">
                <Label htmlFor={`${gridId}-rows`} className="text-[11px] text-muted-foreground">
                  {t('tableCustomRows')}
                </Label>
                <Input
                  id={`${gridId}-rows`}
                  type="number"
                  min={1}
                  max={TABLE_CUSTOM_MAX}
                  value={customRows}
                  onChange={(event) => setCustomRows(event.target.value)}
                  className="mt-1 h-7 w-[4.25rem] px-2 text-center text-xs"
                />
              </div>
              <span className="mb-1.5 text-xs text-muted-foreground" aria-hidden="true">
                ×
              </span>
              <div className="min-w-0">
                <Label htmlFor={`${gridId}-cols`} className="text-[11px] text-muted-foreground">
                  {t('tableCustomCols')}
                </Label>
                <Input
                  id={`${gridId}-cols`}
                  type="number"
                  min={1}
                  max={TABLE_CUSTOM_MAX}
                  value={customCols}
                  onChange={(event) => setCustomCols(event.target.value)}
                  className="mt-1 h-7 w-[4.25rem] px-2 text-center text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={!canInsertCustom}
                onClick={() => {
                  if (customRowCount === null || customColCount === null) return;
                  insertTable({
                    rows: customRowCount,
                    cols: customColCount,
                    withHeaderRow,
                  });
                }}
              >
                {t('tableInsertCustom')}
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
