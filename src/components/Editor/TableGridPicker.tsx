import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
import { cn } from '@/lib/utils';

export const TABLE_PICKER_MAX = 10;
export const TABLE_CUSTOM_MAX = 20;
export const TABLE_PICKER_CELL_PX = 16;
export const TABLE_PICKER_GAP_PX = 2;

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

function sizeFromPointer(clientX: number, clientY: number, grid: HTMLElement): { rows: number; cols: number } {
  const rect = grid.getBoundingClientRect();
  const stride = TABLE_PICKER_CELL_PX + TABLE_PICKER_GAP_PX;
  const cols = Math.min(
    TABLE_PICKER_MAX,
    Math.max(1, Math.ceil((clientX - rect.left) / stride)),
  );
  const rows = Math.min(
    TABLE_PICKER_MAX,
    Math.max(1, Math.ceil((clientY - rect.top) / stride)),
  );
  return { rows, cols };
}

export function TableGridPicker({ editor }: TableGridPickerProps) {
  const { t } = useLocale();
  const gridId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
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
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      gridRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
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
  const sizeLabel = formatMessage(t('tablePickerCaption'), { rows: hoverRows, cols: hoverCols });
  const gridPx =
    TABLE_PICKER_MAX * TABLE_PICKER_CELL_PX + (TABLE_PICKER_MAX - 1) * TABLE_PICKER_GAP_PX;

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
        className="w-auto p-2.5 bg-popover border border-border shadow-lg z-50"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <div
            ref={gridRef}
            role="grid"
            id={gridId}
            tabIndex={0}
            aria-label={sizeLabel}
            className="outline-none"
            style={{
              width: gridPx,
              display: 'grid',
              gridTemplateColumns: `repeat(${TABLE_PICKER_MAX}, ${TABLE_PICKER_CELL_PX}px)`,
              gap: TABLE_PICKER_GAP_PX,
            }}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return;
              const next = sizeFromPointer(event.clientX, event.clientY, event.currentTarget);
              if (next.rows !== hoverRows || next.cols !== hoverCols) {
                moveHover(next.rows, next.cols);
              }
            }}
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
                    tabIndex={-1}
                    data-testid={`table-picker-cell-${row}-${col}`}
                    aria-label={formatMessage(t('tablePickerSize'), { rows: row, cols: col })}
                    aria-selected={active}
                    className={cn(
                      'h-4 w-4 rounded-[1px] border transition-colors duration-75',
                      active
                        ? 'border-[#2b7de9] bg-[#c5dcff] dark:border-[#8ab4f8] dark:bg-[#1a73e8]/55'
                        : 'border-[#c7c7c7] bg-white dark:border-white/25 dark:bg-background',
                    )}
                    onMouseEnter={() => moveHover(row, col)}
                    onFocus={() => moveHover(row, col)}
                    onClick={() => insertTable({ rows: row, cols: col, withHeaderRow })}
                  />
                );
              }),
            )}
          </div>
          <p
            data-testid="table-picker-caption"
            className="text-center text-xs tabular-nums text-muted-foreground"
          >
            {sizeLabel}
          </p>
          <Separator />
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={withHeaderRow}
              onChange={(event) => setWithHeaderRow(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#2b7de9]"
            />
            {t('tableHeaderRow')}
          </label>
          <div className="flex items-end gap-1.5">
            <div className="min-w-0">
              <Label htmlFor={`${gridId}-rows`} className="text-[11px] font-normal text-muted-foreground">
                {t('tableCustomRows')}
              </Label>
              <Input
                id={`${gridId}-rows`}
                type="number"
                min={1}
                max={TABLE_CUSTOM_MAX}
                value={customRows}
                onChange={(event) => setCustomRows(event.target.value)}
                className="mt-1 h-7 w-[3.25rem] px-1.5 text-center text-xs"
              />
            </div>
            <span className="mb-1.5 text-xs text-muted-foreground" aria-hidden="true">
              ×
            </span>
            <div className="min-w-0">
              <Label htmlFor={`${gridId}-cols`} className="text-[11px] font-normal text-muted-foreground">
                {t('tableCustomCols')}
              </Label>
              <Input
                id={`${gridId}-cols`}
                type="number"
                min={1}
                max={TABLE_CUSTOM_MAX}
                value={customCols}
                onChange={(event) => setCustomCols(event.target.value)}
                className="mt-1 h-7 w-[3.25rem] px-1.5 text-center text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={!canInsertCustom}
              aria-label={t('tableInsertCustom')}
              onClick={() => {
                if (customRowCount === null || customColCount === null) return;
                insertTable({
                  rows: customRowCount,
                  cols: customColCount,
                  withHeaderRow,
                });
              }}
            >
              {t('tableInsertAction')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
