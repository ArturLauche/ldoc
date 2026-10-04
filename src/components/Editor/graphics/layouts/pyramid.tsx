import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { fillVar, useGraphicRender, useShapeText } from '../graphicContext';
import { tierGeometry } from '../geometry';
import { GraphicLabel, GraphicNode, ShapeLayer } from '../primitives';
import type { LayoutRendererProps } from '../types';

/**
 * Trapezoid tiers of equal height. Labels sit within each tier's narrow edge,
 * so they never run past the slanted sides.
 */
function Tiers({ items, inverted, apex, gap }: LayoutRendererProps & { inverted: boolean; apex: number; gap: string }) {
  return (
    <div className="mx-auto grid w-full max-w-[36rem] auto-rows-fr justify-items-center" style={{ rowGap: gap }}>
      {items.map((item, index) => (
        <Tier key={item.id} item={item} index={index} count={items.length} inverted={inverted} apex={apex} />
      ))}
    </div>
  );
}

function Tier({
  item,
  index,
  count,
  inverted,
  apex,
}: {
  item: LayoutRendererProps['items'][number];
  index: number;
  count: number;
  inverted: boolean;
  apex: number;
}) {
  const color = useShapeText(index);
  // Narrow editors get a flatter, wider-topped pyramid so the upper tiers
  // still hold a few words per line.
  const wide = tierGeometry(index, count, apex, inverted);
  const narrow = tierGeometry(index, count, Math.max(apex, 0.5), inverted);
  // Padding percentages resolve against the parent box, not the tier.
  const pad = (tier: typeof wide) => `calc(${(tier.inset * tier.width) / 100}% + 0.5rem)`;
  return (
    <GraphicNode
      item={item}
      index={index}
      tone={null}
      className="flex min-h-[3.25rem] w-[var(--sg-w-n)] items-center justify-center px-[var(--sg-pad-n)] py-2.5 text-center font-semibold [--sg-clip:var(--sg-clip-n)] @md:w-[var(--sg-w-w)] @md:px-[var(--sg-pad-w)] @md:[--sg-clip:var(--sg-clip-w)]"
      style={{
        color,
        '--sg-w-n': `${narrow.width}%`,
        '--sg-w-w': `${wide.width}%`,
        '--sg-pad-n': pad(narrow),
        '--sg-pad-w': pad(wide),
        '--sg-clip-n': narrow.clip,
        '--sg-clip-w': wide.clip,
      } as CSSProperties}
    >
      <ShapeLayer index={index} />
      <GraphicLabel item={item} className="relative w-full" />
    </GraphicNode>
  );
}

export function BasicPyramid({ items }: LayoutRendererProps) {
  return <Tiers items={items} inverted={false} apex={0.26} gap="3px" />;
}

export function InvertedPyramid({ items }: LayoutRendererProps) {
  return <Tiers items={items} inverted apex={0.26} gap="3px" />;
}

/** Stages narrowing towards a spout; stage gaps keep it distinct from the inverted pyramid. */
export function Funnel({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const count = items.length;
  return (
    <div className="mx-auto flex w-full max-w-[36rem] flex-col items-center gap-1.5">
      {items.map((item, index) => {
        const last = index === count - 1;
        // Stages narrow from full width to 46%; the last one is a straight spout.
        const top = 100 - (54 * index) / Math.max(count - 1, 1);
        const bottom = last ? top : 100 - (54 * (index + 1)) / Math.max(count - 1, 1);
        const inset = ((top - bottom) / 2 / top) * 100;
        return (
          <FunnelStage
            key={item.id}
            item={item}
            index={index}
            width={top}
            inset={inset}
            spout={last}
            intense={style === 'intense'}
          />
        );
      })}
    </div>
  );
}

function FunnelStage({
  item,
  index,
  width,
  inset,
  spout,
  intense,
}: {
  item: LayoutRendererProps['items'][number];
  index: number;
  width: number;
  inset: number;
  spout: boolean;
  intense: boolean;
}) {
  const color = useShapeText(index);
  const clip = spout
    ? 'inset(0 round 0 0 0.75rem 0.75rem)'
    : `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`;
  return (
    <GraphicNode
      item={item}
      index={index}
      tone={null}
      className={cn('flex min-h-[3rem] items-center justify-center py-2.5 text-center font-semibold', intense && 'drop-shadow-sm')}
      style={{
        width: `${width}%`,
        paddingInline: `calc(${(inset * width) / 100}% + 0.75rem)`,
        color,
        '--sg-clip': clip,
      } as CSSProperties}
    >
      <ShapeLayer index={index} />
      <GraphicLabel item={item} className="relative w-full" />
    </GraphicNode>
  );
}

/** A slim pyramid keyed to labeled rows, for levels with longer text. */
export function PyramidList({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const count = items.length;
  return (
    <div className="grid auto-rows-fr grid-cols-[minmax(5.5rem,34%)_minmax(0,1fr)] gap-x-4 gap-y-[3px]">
      {items.map((item, index) => {
        const tier = tierGeometry(index, count, 0.06, false);
        return (
          <div key={item.id} className="contents">
            <TierMarker index={index} width={tier.width} clip={tier.clip} />
            <GraphicNode
              item={item}
              index={index}
              tone={{
                backgroundColor: 'transparent',
                boxShadow: `inset 0 -1px 0 var(--sg-line)`,
              }}
              className={cn(
                'relative my-0.5 flex items-center py-2 ps-3 text-start font-medium',
                index === count - 1 && 'shadow-none',
              )}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-2 start-0 w-1 rounded-full"
                style={{ backgroundColor: style === 'outline' ? 'var(--sg-line-strong)' : fillVar(index) }}
              />
              <GraphicLabel item={item} className="w-full" />
            </GraphicNode>
          </div>
        );
      })}
    </div>
  );
}

function TierMarker({ index, width, clip }: { index: number; width: number; clip: string }) {
  const color = useShapeText(index);
  return (
    <div className="flex justify-center">
      <span
        aria-hidden="true"
        className="relative flex min-h-[2.75rem] items-end justify-center pb-1.5 text-sm font-bold tabular-nums"
        style={{ width: `${width}%`, color, '--sg-clip': clip } as CSSProperties}
      >
        <ShapeLayer index={index} />
        <span className="relative">{index + 1}</span>
      </span>
    </div>
  );
}
