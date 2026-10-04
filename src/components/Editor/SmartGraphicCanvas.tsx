import { useCallback, useContext, useMemo, useRef, type KeyboardEvent } from 'react';
import { LocaleContext } from '@/hooks/useLocale';
import { t } from '@/lib/translations';
import { cn } from '@/lib/utils';
import {
  GRAPHIC_PLACEHOLDER_KEYS,
  getSmartGraphicLayout,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { GraphicRenderContext, type GraphicRenderContextValue } from './graphics/graphicContext';
import { OverflowItems } from './graphics/primitives';
import { LAYOUT_RENDERERS } from './graphics/registry';

interface SmartGraphicCanvasProps {
  graphic: SmartGraphicModel;
  /** Static thumbnail for galleries and pickers. */
  compact?: boolean;
  editable?: boolean;
  activeId?: string | null;
  onSelectItem?: (id: string) => void;
  onChangeLabel?: (id: string, label: string) => void;
  /** Escape in a label: hand focus back to the document. */
  onExit?: () => void;
}

/**
 * Renders a smart graphic through the layout registry. Layouts size
 * themselves with container queries, so they respond to the editor's width
 * rather than the window's.
 */
export function SmartGraphicCanvas({
  graphic,
  compact = false,
  editable = false,
  activeId = null,
  onSelectItem,
  onChangeLabel,
  onExit,
}: SmartGraphicCanvasProps) {
  // Optional: thumbnails can render outside the app's locale provider.
  const locale = useContext(LocaleContext)?.locale ?? 'en';
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = getSmartGraphicLayout(graphic.layoutId);

  const strings = useMemo(
    () => ({
      versus: t(locale, 'graphicVersus'),
      overflow: t(locale, 'graphicOverflow'),
      emptyLabel: t(locale, GRAPHIC_PLACEHOLDER_KEYS[layout.placeholderKind]),
    }),
    [locale, layout.placeholderKind],
  );

  const onLabelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit?.();
        return;
      }
      if (event.key !== 'Enter') return;
      // Labels are single paragraphs: Enter moves to the next shape instead,
      // with its text selected so typing replaces a placeholder.
      event.preventDefault();
      const labels = Array.from(
        rootRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea[data-graphic-label]') ?? [],
      );
      const next = labels[labels.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
      next?.focus();
      next?.select();
    },
    [onExit],
  );

  const interactive = editable && !compact;
  const context = useMemo<GraphicRenderContextValue>(
    () => ({
      editable: interactive,
      activeId: interactive ? activeId : null,
      style: graphic.style,
      strings,
      onSelectItem,
      onChangeLabel,
      onLabelKeyDown,
    }),
    [interactive, activeId, graphic.style, strings, onSelectItem, onChangeLabel, onLabelKeyDown],
  );

  const Renderer = LAYOUT_RENDERERS[layout.id];
  // Flat layouts draw up to their maximum; extra items (kept when switching
  // from a larger layout) stay visible below the diagram.
  const capacity = layout.supportsHierarchy ? graphic.items.length : layout.maxItems;
  const shown = graphic.items.slice(0, capacity);
  const overflow = graphic.items.slice(capacity);

  return (
    <GraphicRenderContext.Provider value={context}>
      <div
        ref={rootRef}
        className={cn(
          'lwrite-graphic-canvas @container w-full min-w-0',
          compact && 'pointer-events-none select-none',
        )}
        data-layout={graphic.layoutId}
        data-compact={compact ? 'true' : 'false'}
        data-color={graphic.colorSet}
        data-style={graphic.style}
      >
        {graphic.title ? (
          <div className="mb-4 text-center text-base font-semibold leading-snug">{graphic.title}</div>
        ) : null}
        <div data-testid={`graphic-layout-${layout.id}`}>
          <Renderer items={shown} />
        </div>
        <OverflowItems items={overflow} startIndex={shown.length} />
      </div>
    </GraphicRenderContext.Provider>
  );
}
