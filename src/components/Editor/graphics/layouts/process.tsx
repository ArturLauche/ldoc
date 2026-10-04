import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { fillVar, tint, useGraphicRender, useShapeText } from '../graphicContext';
import { Badge, GraphicLabel, GraphicNode, ShapeLayer } from '../primitives';
import type { LayoutRendererProps } from '../types';

/**
 * Depth of a chevron's tip and notch. Steps overlap by 0.375rem (`-mt-1.5` /
 * `-ms-1.5`), less than the notch, so each tip sits 0.5rem short of the next
 * notch: an even, parallel separator between steps, as in classic chevrons.
 */
const NOTCH = '0.875rem';

/** Row of interlocking chevrons; a downward stack of them in narrow editors. */
export function ChevronProcess({ items }: LayoutRendererProps) {
  const wideAtXl = items.length > 4;
  return (
    <div className={cn('flex flex-col', wideAtXl ? '@xl:flex-row' : '@md:flex-row')}>
      {items.map((item, index) => (
        <ChevronStep key={item.id} item={item} index={index} wideAtXl={wideAtXl} />
      ))}
    </div>
  );
}

function ChevronStep({
  item,
  index,
  wideAtXl,
}: {
  item: LayoutRendererProps['items'][number];
  index: number;
  wideAtXl: boolean;
}) {
  const color = useShapeText(index);
  const first = index === 0;
  const row = first
    ? `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${NOTCH}) 0, 100% 50%, calc(100% - ${NOTCH}) 100%, 0 100%, ${NOTCH} 50%)`;
  const column = first
    ? `polygon(0 0, 100% 0, 100% calc(100% - ${NOTCH}), 50% 100%, 0 calc(100% - ${NOTCH}))`
    : `polygon(0 0, 50% ${NOTCH}, 100% 0, 100% calc(100% - ${NOTCH}), 50% 100%, 0 calc(100% - ${NOTCH}))`;
  return (
    <GraphicNode
      item={item}
      index={index}
      tone={null}
      style={{ color, '--sg-clip-row': row, '--sg-clip-col': column } as CSSProperties}
      className={cn(
        'flex min-h-[3.5rem] flex-1 items-center justify-center px-5 pb-[1.375rem] pt-2.5 text-center font-medium [--sg-clip:var(--sg-clip-col)]',
        !first && '-mt-1.5 pt-[1.375rem]',
        wideAtXl
          ? '@xl:mt-0 @xl:py-3 @xl:pe-[1.625rem] @xl:[--sg-clip:var(--sg-clip-row)]'
          : '@md:mt-0 @md:py-3 @md:pe-[1.625rem] @md:[--sg-clip:var(--sg-clip-row)]',
        first
          ? wideAtXl
            ? '@xl:ps-4'
            : '@md:ps-4'
          : wideAtXl
            ? '@xl:-ms-1.5 @xl:ps-[1.875rem]'
            : '@md:-ms-1.5 @md:ps-[1.875rem]',
      )}
    >
      <ShapeLayer index={index} className="rtl:-scale-x-100" />
      <GraphicLabel item={item} className="relative w-full" />
    </GraphicNode>
  );
}

/** Numbered markers on a connecting line; a vertical stepper when narrow. */
export function StepProcess({ items }: LayoutRendererProps) {
  const wideAtXl = items.length > 5;
  return (
    <div role="list"
      className={cn(
        'm-0 flex flex-col gap-3 p-0',
        wideAtXl ? '@xl:flex-row @xl:gap-4' : '@md:flex-row @md:gap-4',
      )}
    >
      {items.map((item, index) => (
        <div role="listitem"
          key={item.id}
          className={cn(
            'relative m-0 flex min-w-0 flex-1 items-start gap-3 p-0',
            wideAtXl ? '@xl:flex-col @xl:items-center' : '@md:flex-col @md:items-center',
          )}
        >
          {index < items.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute -bottom-3 start-[calc(1.125rem-1px)] top-9 w-0.5',
                wideAtXl
                  ? '@xl:bottom-auto @xl:start-[calc(50%+1.5rem)] @xl:top-[calc(1.125rem-1px)] @xl:h-0.5 @xl:w-[calc(100%-2rem)]'
                  : '@md:bottom-auto @md:start-[calc(50%+1.5rem)] @md:top-[calc(1.125rem-1px)] @md:h-0.5 @md:w-[calc(100%-2rem)]',
              )}
              style={{ backgroundColor: 'var(--sg-line)' }}
            />
          ) : null}
          <Badge index={index} className="h-9 w-9 text-sm">
            {index + 1}
          </Badge>
          <GraphicNode
            item={item}
            index={index}
            className={cn(
              'w-full flex-1 rounded-lg px-3 py-2.5 text-start font-medium',
              wideAtXl ? '@xl:text-center' : '@md:text-center',
            )}
          />
        </div>
      ))}
    </div>
  );
}

const ARROW_ROW =
  'polygon(0 0.75rem, calc(100% - 3rem) 0.75rem, calc(100% - 3rem) 0, 100% 50%, calc(100% - 3rem) 100%, calc(100% - 3rem) calc(100% - 0.75rem), 0 calc(100% - 0.75rem))';
const ARROW_COLUMN =
  'polygon(0 0, 100% 0, 100% calc(100% - 2.5rem), 50% 100%, 0 calc(100% - 2.5rem))';

/** Steps riding on one continuous arrow. */
export function ArrowProcess({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const wideAtXl = items.length > 4;
  const band = {
    fill: style === 'outline' ? 'var(--sg-surface)' : tint(0, style === 'subtle' ? 12 : 22),
    edge: style === 'outline' ? fillVar(0) : null,
  };
  return (
    <div
      className={cn(
        'relative px-3 pb-11 pt-3 [--sg-clip:var(--sg-arrow-col)]',
        wideAtXl
          ? '@xl:py-6 @xl:pe-14 @xl:ps-4 @xl:[--sg-clip:var(--sg-arrow-row)]'
          : '@md:py-6 @md:pe-14 @md:ps-4 @md:[--sg-clip:var(--sg-arrow-row)]',
      )}
      style={{ '--sg-arrow-row': ARROW_ROW, '--sg-arrow-col': ARROW_COLUMN } as CSSProperties}
    >
      <ShapeLayer index={0} colors={band} className="rtl:-scale-x-100" />
      <div className={cn('relative flex flex-col gap-2', wideAtXl ? '@xl:flex-row' : '@md:flex-row')}>
        {items.map((item, index) => (
          <GraphicNode
            key={item.id}
            item={item}
            index={index}
            className="flex min-h-[3.25rem] flex-1 items-center justify-center rounded-lg px-3 py-2.5 text-center font-medium shadow-sm"
          />
        ))}
      </div>
    </div>
  );
}

/** Rising steps for growth and maturity; stage one sits lowest. */
export function StaircaseProcess({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  const indentStep = `min(1.5rem, ${Math.round(60 / Math.max(items.length - 1, 1))}%)`;
  return (
    <div className="flex flex-col-reverse gap-2 @md:flex-row @md:items-end @md:gap-2.5">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="ms-[var(--sg-indent)] flex min-w-0 flex-1 items-stretch gap-2 @md:ms-0 @md:flex-col @md:gap-0"
          style={{ '--sg-indent': `calc(${index} * ${indentStep})` } as CSSProperties}
        >
          <GraphicNode
            item={item}
            index={index}
            className="flex flex-1 items-center rounded-lg px-3 py-2.5 text-start font-medium @md:min-h-[3.5rem] @md:flex-none @md:justify-center @md:rounded-b-none @md:text-center"
          />
          <div
            aria-hidden="true"
            className="flex w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums @md:h-[var(--sg-rise)] @md:w-auto @md:items-start @md:rounded-t-none @md:pt-2"
            style={{
              '--sg-rise': `${2.25 + index * 1.25}rem`,
              backgroundColor: tint(index, style === 'outline' ? 8 : 24),
              color: 'hsl(var(--foreground))',
              ...(style === 'outline' ? { boxShadow: `inset 0 0 0 2px ${fillVar(index)}` } : {}),
            } as CSSProperties}
          >
            {index + 1}
          </div>
        </div>
      ))}
    </div>
  );
}
