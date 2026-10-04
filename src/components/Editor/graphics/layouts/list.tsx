import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { cardTone, solidTone, useGraphicRender } from '../graphicContext';
import { Badge, DetailList, GraphicLabel, GraphicNode } from '../primitives';
import type { LayoutRendererProps } from '../types';

export function BlockList({ items }: LayoutRendererProps) {
  return (
    <div className={cn('flex flex-col', items.length > 5 ? 'gap-1.5' : 'gap-2')}>
      {items.map((item, index) => (
        <GraphicNode
          key={item.id}
          item={item}
          index={index}
          className={cn(
            'rounded-lg px-4 text-center font-medium',
            items.length > 5 ? 'py-2' : 'py-3',
          )}
        />
      ))}
    </div>
  );
}

/** Equal columns that fall back to a two-column grid in narrow editors. */
export function HorizontalList({ items }: LayoutRendererProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2',
        items.length > 4
          ? '@xl:grid-cols-[repeat(var(--sg-count),minmax(0,1fr))] @xl:[&>*:last-child:nth-child(odd)]:col-span-1'
          : '@md:grid-cols-[repeat(var(--sg-count),minmax(0,1fr))] @md:[&>*:last-child:nth-child(odd)]:col-span-1',
      )}
      style={{ '--sg-count': items.length } as CSSProperties}
    >
      {items.map((item, index) => (
        <GraphicNode
          key={item.id}
          item={item}
          index={index}
          className="flex min-h-[4.5rem] items-center justify-center rounded-lg px-3 py-3 text-center font-medium"
        />
      ))}
    </div>
  );
}

export function NumberedList({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  return (
    <div role="list" className="flex flex-col gap-2">
      {items.map((item, index) => (
        <GraphicNode
          key={item.id}
          item={item}
          index={index}
          role="listitem"
          tone={cardTone(style, index)}
          className="flex items-center gap-3 rounded-lg py-2 pe-4 ps-2 text-start"
        >
          <Badge index={index} className="h-8 w-8 rounded-md text-sm">
            {index + 1}
          </Badge>
          <GraphicLabel item={item} className="flex-1 font-medium" />
        </GraphicNode>
      ))}
    </div>
  );
}

/** Headed cards; nested items become the card's bullet points. */
export function CardList({ items }: LayoutRendererProps) {
  const { style } = useGraphicRender();
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="flex min-w-0 flex-col overflow-hidden rounded-xl"
          style={cardTone(style === 'outline' ? 'outline' : 'subtle', index)}
        >
          <GraphicNode
            item={item}
            index={index}
            tone={solidTone(style === 'subtle' ? 'filled' : style, index)}
            className="rounded-none px-3 py-2.5 text-start font-semibold"
          />
          <DetailList items={item.children} index={index} className="p-2.5" />
        </div>
      ))}
    </div>
  );
}
