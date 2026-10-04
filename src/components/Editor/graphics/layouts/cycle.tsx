import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { shapeColors, useGraphicRender } from '../graphicContext';
import { donutLabelPoint, donutSegmentPath, pointOnRing, ringAngles, ringTangentDeg } from '../geometry';
import { ArrowHead, Badge, FlowArrow, GraphicLabel, GraphicNode } from '../primitives';
import type { LayoutRendererProps } from '../types';

/**
 * Ring radii in % of the box: square when narrow (near-circle), 16:9 when
 * wide (an ellipse that uses the page width). Narrow labels take a larger
 * share of the width, so the narrow ring is slimmer to keep the side labels
 * inside the box.
 */
const RING_X = 37;
const RING_X_NARROW = 32;
const RING_Y = 38;
const WIDE_ASPECT = 16 / 9;

/**
 * Steps placed around a ring with arrowheads between them. In narrow
 * editors a ring only holds a few readable labels, so five or more steps
 * become a vertical loop instead.
 */
export function BasicCycle({ items }: LayoutRendererProps) {
  const count = items.length;
  const dense = count > 4;
  const angles = ringAngles(count);
  return (
    <div
      className={cn(
        'relative mx-auto w-full @md:aspect-video @md:max-w-[44rem]',
        dense ? 'flex flex-col gap-7 pe-9 @md:block @md:pe-0' : 'aspect-square max-w-[26rem]',
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={cn('absolute inset-0 h-full w-full overflow-visible', dense && 'hidden @md:block')}
      >
        {[RING_X_NARROW, RING_X].map((radius) => (
          <ellipse
            key={radius}
            cx="50"
            cy="50"
            rx={radius}
            ry={RING_Y}
            fill="none"
            stroke="var(--sg-line)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className={radius === RING_X ? 'hidden @md:inline' : '@md:hidden'}
          />
        ))}
      </svg>
      {angles.map((angle, index) => {
        const middle = angle + 180 / count;
        const narrow = pointOnRing(middle, RING_X_NARROW, RING_Y);
        const wide = pointOnRing(middle, RING_X, RING_Y);
        return (
          <span
            key={`arrow-${items[index].id}`}
            aria-hidden="true"
            className={cn(
              'absolute left-[var(--sg-xn)] top-[var(--sg-y)] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center [rotate:var(--sg-turn-narrow)] @md:left-[var(--sg-x)] @md:[rotate:var(--sg-turn-wide)]',
              dense && 'hidden @md:flex',
            )}
            style={{
              '--sg-xn': `${narrow.x}%`,
              '--sg-x': `${wide.x}%`,
              '--sg-y': `${wide.y}%`,
              '--sg-turn-narrow': `${ringTangentDeg(middle, 1, RING_X_NARROW, RING_Y)}deg`,
              '--sg-turn-wide': `${ringTangentDeg(middle, WIDE_ASPECT, RING_X, RING_Y)}deg`,
            } as CSSProperties}
          >
            <ArrowHead className="h-4 w-4" />
          </span>
        );
      })}
      {items.map((item, index) => {
        const point = pointOnRing(angles[index], RING_X, RING_Y);
        const narrow = pointOnRing(angles[index], RING_X_NARROW, RING_Y);
        return (
          <GraphicNode
            key={item.id}
            item={item}
            index={index}
            className={cn(
              'flex min-h-[2.75rem] items-center justify-center rounded-xl px-3 py-2 text-center font-medium',
              dense
                ? 'relative w-full @md:absolute @md:left-[var(--sg-x)] @md:top-[var(--sg-y)] @md:w-[22%] @md:-translate-x-1/2 @md:-translate-y-1/2'
                : 'absolute left-[var(--sg-xn)] top-[var(--sg-y)] w-[36%] -translate-x-1/2 -translate-y-1/2 @md:left-[var(--sg-x)] @md:w-[24%]',
            )}
            style={{ '--sg-xn': `${narrow.x}%`, '--sg-x': `${point.x}%`, '--sg-y': `${point.y}%` } as CSSProperties}
          >
            <GraphicLabel item={item} className="relative w-full" />
            {dense && index < count - 1 ? (
              <span aria-hidden="true" className="absolute -bottom-6 left-1/2 -translate-x-1/2 @md:hidden">
                <FlowArrow direction="down" />
              </span>
            ) : null}
          </GraphicNode>
        );
      })}
      {dense ? <LoopReturn hideAt="md" /> : null}
    </div>
  );
}

/** Return path along the inline end of a vertical loop, back into the first step. */
function LoopReturn({ hideAt }: { hideAt: 'md' | 'xl' }) {
  return (
    <span
      aria-hidden="true"
      data-graphic-connector="loop-return"
      className={cn(
        'pointer-events-none absolute bottom-[1.625rem] end-1 top-[1.625rem] w-8',
        hideAt === 'md' ? '@md:hidden' : '@xl:hidden',
      )}
    >
      <span
        className="absolute inset-0 rounded-e-xl border-y-2 border-e-2 border-s-0"
        style={{ borderColor: 'var(--sg-line-strong)' }}
      />
      <ArrowHead className="absolute -start-1.5 -top-[0.4375rem] rotate-180 rtl:rotate-0" />
    </span>
  );
}

/** A segmented ring with chevron ends, keyed to a numbered legend. */
export function SegmentedCycle({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const count = items.length;
  return (
    <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center @md:gap-8">
      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="aspect-square w-[min(15rem,70%)] shrink-0 overflow-visible @md:w-[min(16rem,40%)]"
      >
        {items.map((item, index) => {
          const colors = shapeColors(style, index);
          const label = donutLabelPoint(index, count);
          return (
            <g key={item.id}>
              <path
                d={donutSegmentPath(index, count)}
                fill={colors.fill}
                stroke={colors.edge ?? 'none'}
                strokeWidth={colors.edge ? 1.25 : 0}
                strokeLinejoin="round"
                style={style === 'intense' ? { filter: 'drop-shadow(0 1.5px 2px hsl(var(--foreground) / 0.3))' } : undefined}
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="7.5"
                fontWeight="700"
                fill={colors.text}
              >
                {index + 1}
              </text>
            </g>
          );
        })}
      </svg>
      <div role="list" className="flex w-full min-w-0 flex-1 flex-col gap-1.5">
        {items.map((item, index) => (
          <div role="listitem" key={item.id}>
            <GraphicNode
              item={item}
              index={index}
              tone={null}
              className="flex items-center gap-3 rounded-lg py-1 pe-2 ps-1 text-start font-medium"
            >
              <Badge index={index} className="h-7 w-7">
                {index + 1}
              </Badge>
              <GraphicLabel item={item} className="flex-1" />
            </GraphicNode>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A process whose last step feeds back into the first. */
export function LoopCycle({ items }: LayoutRendererProps) {
  const wideAtXl = items.length > 4;
  return (
    <div
      className={cn(
        'relative flex flex-col gap-7 pe-9',
        wideAtXl ? '@xl:flex-row @xl:gap-8 @xl:pb-10 @xl:pe-0' : '@md:flex-row @md:gap-8 @md:pb-10 @md:pe-0',
      )}
      style={{ '--sg-count': items.length } as CSSProperties}
    >
      {items.map((item, index) => (
        <GraphicNode
          key={item.id}
          item={item}
          index={index}
          className="flex min-h-[3.25rem] flex-1 items-center justify-center rounded-xl px-3 py-2.5 text-center font-medium"
        >
          <GraphicLabel item={item} className="w-full" />
          {index < items.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute -bottom-6 left-1/2 -translate-x-1/2',
                wideAtXl
                  ? '@xl:-end-7 @xl:bottom-auto @xl:left-auto @xl:top-1/2 @xl:-translate-y-1/2 @xl:translate-x-0'
                  : '@md:-end-7 @md:bottom-auto @md:left-auto @md:top-1/2 @md:-translate-y-1/2 @md:translate-x-0',
              )}
            >
              <FlowArrow direction="down" className={wideAtXl ? '@xl:hidden' : '@md:hidden'} />
              <FlowArrow direction="forward" className={cn('hidden', wideAtXl ? '@xl:block' : '@md:block')} />
            </span>
          ) : null}
        </GraphicNode>
      ))}
      <LoopReturn hideAt={wideAtXl ? 'xl' : 'md'} />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-0 hidden h-9',
          wideAtXl ? '@xl:block' : '@md:block',
        )}
        style={{
          insetInlineStart: 'calc((100% - (var(--sg-count) - 1) * 2rem) / var(--sg-count) / 2)',
          insetInlineEnd: 'calc((100% - (var(--sg-count) - 1) * 2rem) / var(--sg-count) / 2)',
        }}
      >
        <span
          className="absolute inset-0 rounded-b-xl border-x-2 border-b-2 border-t-0"
          style={{ borderColor: 'var(--sg-line-strong)' }}
        />
        <ArrowHead className="absolute -start-[0.4375rem] -top-2.5 -rotate-90" />
      </span>
    </div>
  );
}
