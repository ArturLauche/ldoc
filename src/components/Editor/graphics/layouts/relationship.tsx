import type { CSSProperties } from 'react';
import type { SmartGraphicItem } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { fillVar, tint, useGraphicRender } from '../graphicContext';
import { pointOnRing, ringAngles, satelliteStartAngle } from '../geometry';
import { ArrowHead, GraphicLabel, GraphicNode } from '../primitives';
import type { LayoutRendererProps } from '../types';

/** Two sides divided by a "vs" badge; each side keeps one color. */
export function OpposingIdeas({ items }: LayoutRendererProps) {
  const { strings } = useGraphicRender();
  const middle = Math.ceil(items.length / 2);
  const sides = [items.slice(0, middle), items.slice(middle)];
  return (
    <div className="grid grid-cols-1 gap-3 @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @md:gap-4">
      {sides.map((side, sideIndex) => (
        <div
          key={sideIndex === 0 ? 'first' : 'second'}
          className={cn('flex flex-col justify-center gap-2', sideIndex === 1 && 'order-3')}
        >
          {side.map((item) => (
            <GraphicNode
              key={item.id}
              item={item}
              index={sideIndex}
              className="flex min-h-[3rem] items-center justify-center rounded-lg px-4 py-2.5 text-center font-medium"
            />
          ))}
        </div>
      ))}
      <div aria-hidden="true" className="order-2 flex items-center gap-3 @md:flex-col">
        <span className="h-px flex-1 @md:h-auto @md:w-px" style={{ backgroundColor: 'var(--sg-line)' }} />
        <span
          className="flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
          style={{ borderColor: 'var(--sg-line)', backgroundColor: 'var(--sg-surface)' }}
        >
          {strings.versus}
        </span>
        <span className="h-px flex-1 @md:h-auto @md:w-px" style={{ backgroundColor: 'var(--sg-line)' }} />
      </div>
    </div>
  );
}

/** Satellite ellipse in % of the box (square when narrow, 16:9 when wide). */
const SPOKE_X = 37;
const SPOKE_Y = 38;

/**
 * A hub with spokes to its satellites. Narrow editors with many satellites
 * switch to the hub above a grid of satellites.
 */
export function RadialHub({ items }: LayoutRendererProps) {
  const [hub, ...satellites] = items;
  if (!hub) return null;
  const count = satellites.length;
  // Narrow editors fit three satellites around the hub; more go into a grid.
  const dense = count > 3;
  const angles = ringAngles(count, satelliteStartAngle(count));
  const points = angles.map((angle) => pointOnRing(angle, SPOKE_X, SPOKE_Y));
  return (
    <div
      className={cn(
        'relative mx-auto w-full @md:aspect-video @md:max-w-[44rem]',
        dense ? 'flex flex-col items-center gap-4 @md:block' : 'aspect-square max-w-[26rem]',
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={cn('absolute inset-0 h-full w-full overflow-visible', dense && 'hidden @md:block')}
      >
        {points.map((point, index) => (
          <line
            key={satellites[index].id}
            x1="50"
            y1="50"
            x2={point.x}
            y2={point.y}
            stroke="var(--sg-line)"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <GraphicNode
        item={hub}
        index={0}
        className={cn(
          'z-[1] flex min-h-[4.5rem] items-center justify-center rounded-2xl px-4 py-3 text-center text-[0.9375rem] font-semibold',
          dense
            ? 'relative w-[min(14rem,80%)] @md:absolute @md:left-1/2 @md:top-1/2 @md:w-[28%] @md:-translate-x-1/2 @md:-translate-y-1/2'
            : 'absolute left-1/2 top-1/2 w-[38%] -translate-x-1/2 -translate-y-1/2 @md:w-[28%]',
        )}
      />
      {dense ? (
        <span aria-hidden="true" className="-my-2 h-4 w-0.5 @md:hidden" style={{ backgroundColor: 'var(--sg-line)' }} />
      ) : null}
      <div
        className={cn(
          dense &&
            'grid w-full grid-cols-2 gap-2 rounded-xl p-2 [&>*:last-child:nth-child(odd)]:col-span-2 @md:contents',
        )}
        style={dense ? { boxShadow: 'inset 0 0 0 1.5px var(--sg-line)' } : undefined}
      >
        {satellites.map((item, index) => (
          <GraphicNode
            key={item.id}
            item={item}
            index={index + 1}
            className={cn(
              'flex min-h-[2.75rem] items-center justify-center rounded-xl px-3 py-2 text-center font-medium',
              dense
                ? 'relative @md:absolute @md:left-[var(--sg-x)] @md:top-[var(--sg-y)] @md:w-[22%] @md:-translate-x-1/2 @md:-translate-y-1/2'
                : 'absolute left-[var(--sg-x)] top-[var(--sg-y)] w-[30%] -translate-x-1/2 -translate-y-1/2 @md:w-[22%]',
            )}
            style={{ '--sg-x': `${points[index].x}%`, '--sg-y': `${points[index].y}%` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Inputs flowing into one result (`converging`), or one source fanning out
 * (`diverging`). Wide: side by side with curved connectors; narrow: stacked.
 */
function FlowRelationship({ items, direction }: LayoutRendererProps & { direction: 'converging' | 'diverging' }) {
  const converging = direction === 'converging';
  const single = converging ? items[items.length - 1] : items[0];
  const many = converging ? items.slice(0, -1) : items.slice(1);
  if (!single) return null;
  const manyStart = converging ? 0 : 1;
  const singleIndex = converging ? items.length - 1 : 0;

  const group = (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 @md:auto-rows-fr @md:grid-cols-1 @md:gap-2.5 @md:[&>*:last-child:nth-child(odd)]:col-span-1',
        converging ? 'order-1' : 'order-3',
      )}
    >
      {many.map((item, offset) => (
        <GraphicNode
          key={item.id}
          item={item}
          index={manyStart + offset}
          className="flex min-h-[2.75rem] items-center justify-center rounded-lg px-3 py-2 text-center font-medium"
        />
      ))}
    </div>
  );

  const connector = (
    <div aria-hidden="true" className="relative order-2 h-10 @md:h-auto">
      {/* Narrow: a fork between the two-column group and the single node. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full @md:hidden">
        {(many.length > 1 ? [25, 75] : [50]).map((x) => (
          <path
            key={x}
            d={converging ? `M ${x} 0 C ${x} 55, 50 45, 50 100` : `M 50 0 C 50 55, ${x} 45, ${x} 100`}
            fill="none"
            stroke="var(--sg-line)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {/* Wide: one curve per row of the stacked group. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 hidden h-full w-full @md:block rtl:-scale-x-100">
        {many.map((item, offset) => {
          const y = ((offset + 0.5) / many.length) * 100;
          return (
            <path
              key={item.id}
              d={converging ? `M 0 ${y} C 55 ${y}, 45 50, 100 50` : `M 0 50 C 55 50, 45 ${y}, 100 ${y}`}
              fill="none"
              stroke="var(--sg-line)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {converging ? (
        <ArrowHead className="absolute -bottom-1 left-1/2 -translate-x-1/2 rotate-90 @md:-end-1 @md:bottom-auto @md:left-auto @md:top-1/2 @md:-translate-y-1/2 @md:translate-x-0 @md:rotate-0 rtl:@md:rotate-180" />
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col @md:grid @md:grid-cols-[minmax(0,1fr)_minmax(3rem,16%)_minmax(0,0.9fr)] @md:items-stretch">
      {converging ? group : null}
      {converging ? connector : null}
      <div className={cn('flex items-center justify-center', converging ? 'order-3' : 'order-1')}>
        <GraphicNode
          item={single}
          index={singleIndex}
          className="flex min-h-[4rem] w-full max-w-[18rem] items-center justify-center rounded-2xl px-4 py-3 text-center text-[0.9375rem] font-semibold"
        />
      </div>
      {converging ? null : connector}
      {converging ? null : group}
    </div>
  );
}

export function ConvergingRelationship({ items }: LayoutRendererProps) {
  return <FlowRelationship items={items} direction="converging" />;
}

export function DivergingRelationship({ items }: LayoutRendererProps) {
  return <FlowRelationship items={items} direction="diverging" />;
}

interface VennCircle {
  x: number;
  y: number;
  /** Label offset away from the overlap, in % of the box. */
  lx: number;
  ly: number;
}

/** Circle centers (in % of a box with the given aspect) for 2–4 sets. */
const VENN: Record<number, { aspect: number; size: number; label: number; circles: VennCircle[] }> = {
  2: {
    aspect: 1.75,
    size: 62,
    label: 20,
    circles: [
      { x: 38, y: 50, lx: -6, ly: 0 },
      { x: 62, y: 50, lx: 6, ly: 0 },
    ],
  },
  3: {
    aspect: 1.15,
    size: 54,
    label: 24,
    circles: [
      { x: 50, y: 34, lx: 0, ly: -10 },
      { x: 37, y: 63, lx: -8, ly: 7 },
      { x: 63, y: 63, lx: 8, ly: 7 },
    ],
  },
  4: {
    aspect: 1.3,
    size: 50,
    label: 21,
    circles: [
      { x: 38, y: 35, lx: -8, ly: -8 },
      { x: 62, y: 35, lx: 8, ly: -8 },
      { x: 38, y: 65, lx: -8, ly: 8 },
      { x: 62, y: 65, lx: 8, ly: 8 },
    ],
  },
};

/** Overlapping sets; labels sit in each circle's own region. */
export function VennDiagram({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const layout = VENN[Math.min(Math.max(items.length, 2), 4)];
  const alpha = style === 'outline' ? 0 : style === 'subtle' ? 14 : style === 'intense' ? 34 : 24;
  return (
    <div
      className="relative mx-auto w-full max-w-[34rem]"
      style={{ aspectRatio: String(layout.aspect) }}
    >
      {items.map((item, index) => {
        const circle = layout.circles[index];
        const width = layout.size / layout.aspect;
        return (
          <span
            key={`circle-${item.id}`}
            aria-hidden="true"
            className={cn('absolute -translate-x-1/2 -translate-y-1/2 rounded-full', style === 'intense' && 'shadow-lg')}
            style={{
              left: `${circle.x}%`,
              top: `${circle.y}%`,
              width: `${width}%`,
              height: `${layout.size}%`,
              backgroundColor: `color-mix(in srgb, ${fillVar(index)} ${alpha}%, transparent)`,
              boxShadow: `inset 0 0 0 2px ${fillVar(index)}`,
            }}
          />
        );
      })}
      {items.map((item, index) => {
        const circle = layout.circles[index];
        return (
          <GraphicNode
            key={item.id}
            item={item}
            index={index}
            tone={null}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md px-0.5 py-1 text-center text-xs font-semibold leading-tight text-foreground @md:px-1 @md:text-[0.8125rem]"
            style={{ left: `${circle.x + circle.lx}%`, top: `${circle.y + circle.ly}%`, width: `${layout.label}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Nested circles resting on a common base (markets, scopes, layers of
 * influence): the first item is the outermost circle.
 */
export function NestedCircles({ items }: LayoutRendererProps) {
  const ratio = items.length >= 5 ? 0.82 : items.length === 4 ? 0.78 : 0.72;
  return (
    <div className="mx-auto w-[min(100%,24rem)]">
      <NestedRing items={items} index={0} ratio={ratio} />
    </div>
  );
}

function NestedRing({ items, index, ratio }: { items: SmartGraphicItem[]; index: number; ratio: number }) {
  const { style } = useGraphicRender();
  const item = items[index];
  if (!item) return null;
  const innermost = index === items.length - 1;
  const filled = style === 'filled' || style === 'intense';
  const background = filled ? fillVar(index) : style === 'outline' ? 'var(--sg-surface)' : tint(index, 14 + index * 6);
  const text = filled ? 'var(--sg-on)' : 'hsl(var(--foreground))';
  return (
    <div
      className={cn('relative aspect-square w-full rounded-full', style === 'intense' && index === 0 && 'shadow-lg')}
      style={{
        backgroundColor: background,
        boxShadow: filled ? (index === 0 ? undefined : '0 0 0 2px var(--sg-surface)') : `inset 0 0 0 2px ${fillVar(index)}`,
        color: text,
      }}
    >
      <GraphicNode
        item={item}
        index={index}
        tone={null}
        className={cn(
          'absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-md px-1 text-center font-semibold leading-tight',
          innermost ? 'top-1/2 w-[64%] -translate-y-1/2' : 'top-0 w-[58%]',
        )}
        style={innermost ? undefined : { height: `${(1 - ratio) * 100 - 2}%` }}
      >
        <GraphicLabel item={item} className="w-full" />
      </GraphicNode>
      {!innermost ? (
        <div className="absolute bottom-[2%] left-1/2 -translate-x-1/2" style={{ width: `${ratio * 100}%` }}>
          <NestedRing items={items} index={index + 1} ratio={ratio} />
        </div>
      ) : null}
    </div>
  );
}
