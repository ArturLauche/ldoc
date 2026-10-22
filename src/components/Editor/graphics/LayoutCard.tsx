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
        'group relative flex min-w-0 flex-col rounded-lg border bg-card text-start transition-[border-color,box-shadow] duration-150 hover:border-ring/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        size === 'small' ? 'gap-1.5 p-1.5' : 'gap-2 p-2',
        selected ? 'border-selected ring-1 ring-selected' : 'border-border',
      )}
    >
      <GraphicPreview
        graphic={preview}
        className={cn(
          'w-full rounded-md bg-muted/50 transition-colors group-hover:bg-muted',
          size === 'small' ? 'aspect-[4/3]' : 'aspect-[16/11]',
        )}
      />
      <span className={cn('flex min-w-0 flex-col', size === 'small' ? 'px-0.5' : 'px-1 pb-0.5')}>
        {/* Names wrap: on a phone, two cards share a row and many languages
            need more than one line for "Horizontal timeline". */}
        <span
          className={cn(
            'line-clamp-2 font-medium leading-snug text-foreground wrap-break-word',
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
        <span className="absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-selected text-primary-foreground">
          <Check className="h-3 w-3" aria-hidden="true" />
          {selectedLabel ? <span className="sr-only">{selectedLabel}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
