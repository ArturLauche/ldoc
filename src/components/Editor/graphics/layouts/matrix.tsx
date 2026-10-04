import { cn } from '@/lib/utils';
import { cardTone, fillVar, solidTone, useGraphicRender } from '../graphicContext';
import { DetailList, GraphicLabel, GraphicNode } from '../primitives';
import type { LayoutRendererProps } from '../types';

/** Outer corners of a 2×2 grid are rounded more than the inner ones. */
const QUADRANT_CORNERS = [
  'rounded-md rounded-ss-2xl',
  'rounded-md rounded-se-2xl',
  'rounded-md rounded-es-2xl',
  'rounded-md rounded-ee-2xl',
];

export function GridMatrix({ items }: LayoutRendererProps) {
  return (
    <div className="mx-auto grid max-w-[40rem] grid-cols-2 gap-1.5">
      {items.map((item, index) => (
        <GraphicNode
          key={item.id}
          item={item}
          index={index}
          className={cn(
            'flex min-h-[5.5rem] items-center justify-center px-4 py-4 text-center text-[0.9375rem] font-semibold',
            QUADRANT_CORNERS[index] ?? 'rounded-md',
          )}
        />
      ))}
    </div>
  );
}

/**
 * Four headed quadrants with bullet points (SWOT and similar). The initial
 * of each heading is drawn large as a quiet watermark.
 */
export function SwotMatrix({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  return (
    <div className="grid grid-cols-1 gap-2 @xs:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={cn('relative flex min-w-0 flex-col overflow-hidden', QUADRANT_CORNERS[index] ?? 'rounded-xl')}
          style={cardTone(style === 'outline' ? 'outline' : 'subtle', index)}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-3 end-2 select-none text-[4.5rem] font-black leading-none opacity-[0.12]"
            style={{ color: fillVar(index) }}
          >
            {item.label.trim().charAt(0).toUpperCase()}
          </span>
          <GraphicNode
            item={item}
            index={index}
            tone={solidTone(style === 'subtle' ? 'filled' : style, index)}
            className="rounded-none px-3 py-2.5 text-start font-semibold"
          />
          {/* Reserves room even without details, so quadrants stay even. */}
          <div className="relative min-h-[3rem] p-2.5">
            <DetailList items={item.children} index={index} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A central idea on a disc over four quadrants. In narrow editors the idea
 * becomes a heading above the quadrants so it never covers their text.
 */
export function TitledMatrix({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const [center, ...quadrants] = items;
  if (!center) return null;
  const alignments = [
    '@md:items-start @md:justify-start @md:text-start',
    '@md:items-start @md:justify-end @md:text-end',
    '@md:items-end @md:justify-start @md:text-start',
    '@md:items-end @md:justify-end @md:text-end',
  ];
  return (
    <div className="relative mx-auto flex max-w-[40rem] flex-col gap-1.5 @md:block">
      <GraphicNode
        item={center}
        index={0}
        className="z-[1] flex items-center justify-center rounded-xl px-4 py-2.5 text-center text-[0.9375rem] font-semibold @md:absolute @md:left-1/2 @md:top-1/2 @md:aspect-square @md:w-[30%] @md:max-w-[11rem] @md:-translate-x-1/2 @md:-translate-y-1/2 @md:rounded-full @md:p-3 @md:[box-shadow:0_0_0_5px_var(--sg-surface)]"
      />
      <div className="grid grid-cols-2 gap-1.5">
        {quadrants.map((item, index) => (
          <GraphicNode
            key={item.id}
            item={item}
            index={index + 1}
            tone={cardTone(style === 'filled' ? 'subtle' : style, index + 1)}
            className={cn(
              'flex min-h-[5rem] items-center justify-center p-3 text-center font-medium @md:min-h-[7.5rem] @md:p-3.5',
              QUADRANT_CORNERS[index] ?? 'rounded-md',
              alignments[index],
            )}
          >
            <GraphicLabel item={item} className="w-full @md:w-[60%]" />
          </GraphicNode>
        ))}
      </div>
    </div>
  );
}
