import { useId } from 'react';
import { Check } from 'lucide-react';
import type { SmartGraphicModel } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { GraphicPreview } from './GraphicPreview';

interface LayoutCardProps {
  name: string;
  hint?: string;
  preview: SmartGraphicModel;
  selected?: boolean;
  /** Text for assistive technology on the selected card (e.g. "Current layout"). */
  selectedLabel?: string;
  size?: 'regular' | 'small';
  onSelect: () => void;
}

/** A layout choice: a live thumbnail with its name and purpose. */
export function LayoutCard({
  name,
  hint,
  preview,
  selected = false,
  selectedLabel,
  size = 'regular',
  onSelect,
}: LayoutCardProps) {
  const hintId = useId();
  return (
    <button
      type="button"
      aria-label={name}
      aria-describedby={hint ? hintId : undefined}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'group relative flex min-w-0 flex-col rounded-xl border bg-card text-start transition-[border-color,box-shadow] duration-150 hover:border-primary/40 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        size === 'small' ? 'gap-1.5 p-1.5' : 'gap-2 p-2',
        selected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <GraphicPreview
        graphic={preview}
        className={cn(
          'w-full rounded-lg bg-background transition-colors group-hover:bg-muted/40',
          size === 'small' ? 'aspect-[4/3]' : 'aspect-[16/11]',
        )}
      />
      <span className={cn('flex min-w-0 flex-col', size === 'small' ? 'px-0.5' : 'px-1 pb-0.5')}>
        <span
          className={cn(
            'truncate font-medium text-foreground',
            size === 'small' ? 'text-xs' : 'text-[0.8125rem] sm:text-sm',
          )}
        >
          {name}
        </span>
        {hint ? (
          <span id={hintId} className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      {selected ? (
        <span className="absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="h-3 w-3" aria-hidden="true" />
          {selectedLabel ? <span className="sr-only">{selectedLabel}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
