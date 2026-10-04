import type { AriaRole, CSSProperties, ReactNode } from 'react';
import type { SmartGraphicItem } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { accentTone, fillVar, shapeColors, solidTone, useGraphicRender } from './graphicContext';

/** An item's text: a growing textarea while editing, plain text otherwise. */
export function GraphicLabel({ item, className }: { item: SmartGraphicItem; className?: string }) {
  const { editable, strings, onChangeLabel, onSelectItem, onLabelKeyDown } = useGraphicRender();
  if (!editable) {
    return <span className={cn('block min-w-0 whitespace-pre-wrap', className)}>{item.label}</span>;
  }
  const emptyLabel = strings.emptyLabel(item.id);
  return (
    <span className={cn('sg-label', className)} data-value={item.label || emptyLabel}>
      <textarea
        rows={1}
        value={item.label}
        placeholder={emptyLabel}
        aria-label={item.label || emptyLabel}
        data-graphic-label={item.id}
        enterKeyHint="next"
        onChange={(event) => onChangeLabel?.(item.id, event.target.value)}
        onFocus={() => onSelectItem?.(item.id)}
        onKeyDown={(event) => onLabelKeyDown?.(event, item.id)}
      />
    </span>
  );
}

interface GraphicNodeProps {
  item: SmartGraphicItem;
  /** Palette step; also used for the default tone. */
  index: number;
  className?: string;
  style?: CSSProperties;
  /** Replaces the default solid tone (pass `null` for an unstyled box). */
  tone?: CSSProperties | null;
  /** Content before/around the label (badges, detail lists). Defaults to the label. */
  children?: ReactNode;
  role?: AriaRole;
}

/**
 * One selectable item. Selection, editing and the `data-graphic-item` hook
 * live here so every layout behaves the same way.
 */
export function GraphicNode({ item, index, className, style, tone, children, role }: GraphicNodeProps) {
  const ctx = useGraphicRender();
  const visual = tone === undefined ? solidTone(ctx.style, index) : (tone ?? {});
  return (
    <div
      role={role}
      className={cn('relative min-w-0', className)}
      style={{ ...visual, ...style }}
      data-graphic-item={item.id}
      data-active={ctx.activeId === item.id ? 'true' : undefined}
      data-graphic-edit={ctx.editable ? 'true' : undefined}
      onMouseDown={(event) => {
        if (ctx.editable) event.stopPropagation();
      }}
      onClick={(event) => {
        if (!ctx.editable) return;
        event.stopPropagation();
        ctx.onSelectItem?.(item.id);
      }}
    >
      {children ?? <GraphicLabel item={item} />}
    </div>
  );
}

/**
 * A non-rectangular shape behind a node's content, clipped to `--sg-clip`
 * (set by the caller, optionally per container size). The content stays
 * unclipped, so labels and the selection ring are never cut off.
 */
export function ShapeLayer({
  index,
  colors,
  className,
}: {
  index: number;
  /** Overrides the item's palette colors. */
  colors?: { fill: string; edge: string | null };
  className?: string;
}) {
  const { style } = useGraphicRender();
  const { fill, edge } = colors ?? shapeColors(style, index);
  const intense = style === 'intense' && !colors;
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0', intense && 'drop-shadow-md', className)}
    >
      <span
        className="absolute inset-0 [clip-path:var(--sg-clip)]"
        style={{
          background: edge ?? fill,
          ...(intense
            ? { backgroundImage: `linear-gradient(160deg, color-mix(in srgb, ${fill} 78%, var(--sg-on)), ${fill} 70%)` }
            : {}),
        }}
      />
      {edge ? (
        <span className="absolute inset-[2px] [clip-path:var(--sg-clip)]" style={{ background: fill }} />
      ) : null}
    </span>
  );
}

export function Badge({
  index,
  children,
  className,
}: {
  index: number;
  children: ReactNode;
  className?: string;
}) {
  const { style } = useGraphicRender();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
        className,
      )}
      style={accentTone(style, index)}
    >
      {children}
    </span>
  );
}

/** Direction arrow for flows; mirrors in right-to-left documents. */
export function FlowArrow({ direction, className }: { direction: 'forward' | 'down' | 'up'; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn(
        'h-4 w-4 shrink-0',
        direction === 'forward' && 'rtl:-scale-x-100',
        direction === 'down' && 'rotate-90',
        direction === 'up' && '-rotate-90',
        className,
      )}
      style={{ color: 'var(--sg-line-strong)' }}
    >
      <path d="M3 8h8.5M8 3.5 12.5 8 8 12.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A small filled arrowhead pointing right (rotate it for other directions). */
export function ArrowHead({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn('h-3.5 w-3.5 shrink-0', className)}
      style={{ color: 'var(--sg-line-strong)', ...style }}
    >
      <path d="M2 1.5 10.5 6 2 10.5Z" fill="currentColor" />
    </svg>
  );
}

/** Nested items as a quiet bullet list inside cards and timeline entries. */
export function DetailList({ items, index, className }: { items: SmartGraphicItem[]; index: number; className?: string }) {
  const { style } = useGraphicRender();
  if (!items.length) return null;
  return (
    <div role="list" className={cn('flex flex-col gap-1', className)}>
      {items.map((child) => (
        <GraphicNode
          key={child.id}
          item={child}
          index={index}
          role="listitem"
          tone={null}
          className="flex items-start gap-2 rounded-md px-1 py-0.5 text-start text-[0.8125rem] leading-snug text-foreground/85"
        >
          <span
            aria-hidden="true"
            className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: style === 'outline' ? 'var(--sg-line-strong)' : fillVar(index) }}
          />
          <GraphicLabel item={child} className="flex-1" />
        </GraphicNode>
      ))}
    </div>
  );
}

/**
 * Items beyond what a layout can draw (kept after switching from a larger
 * layout). They stay visible and editable instead of silently disappearing.
 */
export function OverflowItems({ items, startIndex }: { items: SmartGraphicItem[]; startIndex: number }) {
  const { strings } = useGraphicRender();
  if (!items.length) return null;
  return (
    <div className="mt-4 border-t border-dashed pt-3" style={{ borderColor: 'var(--sg-line)' }}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{strings.overflow}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item, offset) => (
          <GraphicNode
            key={item.id}
            item={item}
            index={startIndex + offset}
            className="min-w-[6rem] max-w-full rounded-md px-3 py-1.5 text-center text-[0.8125rem]"
          />
        ))}
      </div>
    </div>
  );
}
