import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { accentTone, cardTone, useGraphicRender } from '../graphicContext';
import { DetailList, GraphicNode } from '../primitives';
import type { LayoutRendererProps } from '../types';

/** Milestone marker; a halo in the surface color keeps the rail from touching it. */
function Dot({ index, className }: { index: number; className?: string }) {
  const { style } = useGraphicRender();
  const tone = accentTone(style, index);
  return (
    <span
      aria-hidden="true"
      className={cn('block h-3.5 w-3.5 shrink-0 rounded-full', className)}
      style={{ ...tone, boxShadow: ['0 0 0 4px var(--sg-surface)', tone.boxShadow].filter(Boolean).join(', ') }}
    />
  );
}

/** Breakpoint-specific class sets; literal strings so Tailwind can see them. */
const HORIZONTAL = {
  md: {
    grid: '@md:grid-cols-[repeat(var(--sg-count),minmax(0,1fr))] @md:gap-x-2 @md:gap-y-0',
    marker: '@md:items-center @md:justify-center @md:pt-0 @md:[grid-column:var(--sg-col)] @md:[grid-row:var(--sg-axis-row)]',
    axis: '@md:-inset-x-1 @md:bottom-auto @md:top-[calc(50%-1px)] @md:h-0.5 @md:w-auto',
    axisFirst: '@md:start-1/2',
    axisLast: '@md:end-1/2',
    label: '@md:[grid-column:var(--sg-col)] @md:[grid-row:var(--sg-label-row)] @md:pt-3 @md:text-center',
    above: '@md:justify-end @md:pb-3 @md:pt-0',
    spread: '@md:-mx-[40%]',
    spreadFirst: '@md:ms-0 @md:text-start',
    spreadLast: '@md:me-0 @md:text-end',
  },
  xl: {
    grid: '@xl:grid-cols-[repeat(var(--sg-count),minmax(0,1fr))] @xl:gap-x-2 @xl:gap-y-0',
    marker: '@xl:items-center @xl:justify-center @xl:pt-0 @xl:[grid-column:var(--sg-col)] @xl:[grid-row:var(--sg-axis-row)]',
    axis: '@xl:-inset-x-1 @xl:bottom-auto @xl:top-[calc(50%-1px)] @xl:h-0.5 @xl:w-auto',
    axisFirst: '@xl:start-1/2',
    axisLast: '@xl:end-1/2',
    label: '@xl:[grid-column:var(--sg-col)] @xl:[grid-row:var(--sg-label-row)] @xl:pt-3 @xl:text-center',
    above: '@xl:justify-end @xl:pb-3 @xl:pt-0',
    spread: '@xl:-mx-[40%]',
    spreadFirst: '@xl:ms-0 @xl:text-start',
    spreadLast: '@xl:me-0 @xl:text-end',
  },
} as const;

/**
 * Milestones on a horizontal axis. With many milestones, labels alternate
 * above and below the axis and borrow width from their neighbors; narrow
 * editors turn the axis into a vertical rail.
 */
export function HorizontalTimeline({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const alternate = items.length > 4;
  const bp = HORIZONTAL[items.length > 6 ? 'xl' : 'md'];
  const last = items.length - 1;
  return (
    <div
      className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3', bp.grid)}
      style={{ '--sg-count': items.length } as CSSProperties}
    >
      {items.map((item, index) => {
        const above = alternate && index % 2 === 0;
        const placement = {
          '--sg-row': index + 1,
          '--sg-col': index + 1,
          '--sg-axis-row': alternate ? 2 : 1,
          '--sg-label-row': alternate ? (above ? 1 : 3) : 2,
        } as CSSProperties;
        return (
          <div key={item.id} className="contents">
            <span
              className={cn(
                'relative flex items-start pt-[0.6875rem] [grid-column:1] [grid-row:var(--sg-row)]',
                bp.marker,
              )}
              style={placement}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -bottom-1.5 -top-1.5 start-[calc(0.4375rem-1px)] w-0.5',
                  index === 0 && 'top-[0.875rem]',
                  index === last && 'bottom-[calc(100%-0.875rem)]',
                  bp.axis,
                  index === 0 && bp.axisFirst,
                  index === last && bp.axisLast,
                )}
                style={{ backgroundColor: 'var(--sg-line)' }}
              />
              <Dot index={index} className="relative" />
            </span>
            <div
              className={cn(
                'flex min-w-0 flex-col [grid-column:2] [grid-row:var(--sg-row)]',
                bp.label,
                above && bp.above,
                alternate && bp.spread,
                alternate && index === 0 && bp.spreadFirst,
                alternate && index === last && bp.spreadLast,
              )}
              style={placement}
            >
              <GraphicNode
                item={item}
                index={index}
                tone={cardTone(style === 'filled' || style === 'intense' ? 'subtle' : style, index)}
                className="rounded-lg px-3 py-2 font-medium"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Milestones down a rail; nested items list the milestone's details. */
export function VerticalTimeline({ items }: LayoutRendererProps) {
  return (
    <div role="list" className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div role="listitem" key={item.id} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
          {index < items.length - 1 ? <Rail className="-bottom-8 start-[calc(0.75rem-1px)]" /> : null}
          <span className="relative flex justify-center pt-[0.8125rem]">
            <Dot index={index} />
          </span>
          <TimelineEntry item={item} index={index} />
        </div>
      ))}
    </div>
  );
}

/** Rail segment from this milestone's dot to the next one's. */
function Rail({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('absolute top-5 w-0.5', className)}
      style={{ backgroundColor: 'var(--sg-line)' }}
    />
  );
}

/** A milestone: its heading alone, or a card with the heading and its details. */
function TimelineEntry({
  item,
  index,
  align = 'start',
}: {
  item: LayoutRendererProps['items'][number];
  index: number;
  align?: 'start' | 'end';
}) {
  const { style } = useGraphicRender();
  const heading = (
    <GraphicNode
      item={item}
      index={index}
      className={cn(
        'flex min-h-[2.5rem] items-center rounded-lg px-3 py-2 font-semibold',
        'text-start',
        align === 'end' && '@md:justify-end @md:text-end',
      )}
    />
  );
  if (!item.children.length) return heading;
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1 rounded-xl pb-1.5 text-start', align === 'end' && '@md:text-end')}
      style={cardTone(style === 'outline' ? 'outline' : 'subtle', index)}
    >
      {heading}
      <DetailList items={item.children} index={index} className="px-2" />
    </div>
  );
}

/**
 * A central rail with entries alternating sides, overlapping slightly so
 * the zigzag stays compact; one-sided in narrow editors.
 */
export function AlternatingTimeline({ items }: LayoutRendererProps) {
  return (
    <div
      role="list"
      className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 @md:grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] @md:gap-x-4 @md:gap-y-0"
    >
      {items.map((item, index) => {
        const before = index % 2 === 0;
        const last = index === items.length - 1;
        return (
          <div
            role="listitem"
            key={item.id}
            className={cn('relative col-span-2 grid grid-cols-subgrid @md:col-span-3', !last && '@md:-mb-3.5')}
          >
            {!last ? (
              <Rail className="-bottom-8 start-[calc(0.75rem-1px)] @md:-bottom-1.5 @md:start-[calc(50%-1px)]" />
            ) : null}
            <span className="relative col-start-1 row-start-1 flex justify-center pt-[0.8125rem] @md:col-start-2">
              <Dot index={index} />
            </span>
            <div className={cn('relative col-start-2 row-start-1 min-w-0', before ? '@md:col-start-1' : '@md:col-start-3')}>
              <TimelineEntry item={item} index={index} align={before ? 'end' : 'start'} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
