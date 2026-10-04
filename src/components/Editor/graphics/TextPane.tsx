import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/useLocale';
import {
  canAddGraphicItem,
  canDemoteGraphicItem,
  canMoveGraphicItem,
  canPromoteGraphicItem,
  canRemoveGraphicItem,
  countGraphicNodes,
  demoteGraphicItem,
  getSmartGraphicLayout,
  insertGraphicItem,
  isSequentialGraphicLayout,
  moveGraphicItem,
  promoteGraphicItem,
  removeGraphicItem,
  updateGraphicTitle,
  updateItemLabel,
  type SmartGraphicItem,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface Row {
  item: SmartGraphicItem;
  depth: number;
  /** Index among its siblings. */
  position: number;
}

function toRows(items: SmartGraphicItem[], depth = 0): Row[] {
  return items.flatMap((item, position) => [{ item, depth, position }, ...toRows(item.children, depth + 1)]);
}

/**
 * The graphic as an editable outline. Keys follow outliners: Enter adds an
 * item, Backspace in an empty item removes it, Tab / Shift+Tab change the
 * level in hierarchies and Alt+Arrow keys reorder.
 */
export function TextPane({
  graphic,
  activeId,
  onSelect,
  onChange,
}: {
  graphic: SmartGraphicModel;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChange: (next: SmartGraphicModel) => void;
}) {
  const { t, locale } = useLocale();
  const layout = getSmartGraphicLayout(graphic.layoutId);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null>(null);
  const rows = toRows(graphic.items);
  // Same rule as exports: sequential layouts number their top level.
  const numbered = isSequentialGraphicLayout(graphic.layoutId);

  // Structural edits can remount inputs; restore focus to the edited item.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const input = inputs.current.get(id);
    if (!input) return;
    pendingFocus.current = null;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [graphic]);

  const commit = (next: SmartGraphicModel, focusId: string | null) => {
    if (next === graphic) return;
    pendingFocus.current = focusId;
    if (focusId) onSelect(focusId);
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: Row, index: number) => {
    if (event.nativeEvent.isComposing) return;
    const { item } = row;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!canAddGraphicItem(graphic)) return;
      const { model, itemId } = insertGraphicItem(graphic, item.id, locale);
      commit(model, itemId);
      return;
    }
    if (event.key === 'Backspace' && item.label === '' && canRemoveGraphicItem(graphic, item.id)) {
      event.preventDefault();
      const previous = rows[index - 1]?.item.id ?? rows[index + 1]?.item.id ?? null;
      commit(removeGraphicItem(graphic, item.id), previous);
      return;
    }
    if (event.key === 'Tab' && layout.supportsHierarchy) {
      const allowed = event.shiftKey ? canPromoteGraphicItem(graphic, item.id) : canDemoteGraphicItem(graphic, item.id);
      // Without a level change, Tab keeps moving focus as usual.
      if (!allowed) return;
      event.preventDefault();
      commit(event.shiftKey ? promoteGraphicItem(graphic, item.id) : demoteGraphicItem(graphic, item.id), item.id);
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const direction = event.key === 'ArrowUp' ? 'up' : 'down';
      // At either end the keys keep their usual text-field behavior.
      if (!canMoveGraphicItem(graphic, item.id, direction)) return;
      event.preventDefault();
      commit(moveGraphicItem(graphic, item.id, direction), item.id);
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Input
        value={graphic.title}
        placeholder={t('graphicTitlePlaceholder')}
        aria-label={t('graphicTitlePlaceholder')}
        onChange={(event) => onChange(updateGraphicTitle(graphic, event.target.value))}
        className="h-9 font-medium"
      />
      <div className="max-h-[min(18rem,45vh)] space-y-1 overflow-y-auto overscroll-contain p-0.5">
        {rows.map((row, index) => (
          <div key={row.item.id} className="flex items-center gap-1.5" style={{ paddingInlineStart: row.depth * 16 }}>
            <span
              aria-hidden="true"
              className={cn(
                'flex w-5 shrink-0 justify-center text-[0.6875rem] tabular-nums text-muted-foreground',
                row.depth > 0 && 'border-s border-border',
              )}
            >
              {numbered && row.depth === 0 ? row.position + 1 : '•'}
            </span>
            <Input
              ref={(element) => {
                if (element) inputs.current.set(row.item.id, element);
                else inputs.current.delete(row.item.id);
              }}
              value={row.item.label}
              aria-label={row.item.label || t('graphicItemPlaceholder')}
              onFocus={() => onSelect(row.item.id)}
              onChange={(event) => onChange(updateItemLabel(graphic, row.item.id, event.target.value))}
              onKeyDown={(event) => onKeyDown(event, row, index)}
              className={cn('h-8', row.item.id === activeId && 'border-ring ring-1 ring-ring')}
            />
          </div>
        ))}
      </div>
      <div className="space-y-0.5 border-t border-border pt-2 text-[0.6875rem] leading-snug text-muted-foreground">
        <p className="font-medium tabular-nums text-foreground/80">
          {formatMessage(t('graphicItemCount'), { count: countGraphicNodes(graphic.items), max: layout.maxItems })}
        </p>
        <p>{t('graphicTextPaneHint')}</p>
        {layout.supportsHierarchy ? <p>{t('graphicTextPaneHierarchyHint')}</p> : null}
      </div>
    </div>
  );
}
