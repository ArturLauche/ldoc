import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { SmartGraphicModel } from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { SmartGraphicCanvas } from '../SmartGraphicCanvas';

/** Virtual page width for thumbnails: wide enough for each layout's desktop form. */
const PREVIEW_WIDTH = 580;

/**
 * A scaled-down render of the real diagram, so previews match what gets
 * inserted. The canvas lays out at a fixed width and is scaled to fit the
 * frame; it stays hidden until measured to avoid a flash at full size.
 * Memoized: galleries show many of these, and typing in the search field
 * must not re-render diagrams whose model did not change.
 */
export const GraphicPreview = memo(function GraphicPreview({
  graphic,
  className,
}: {
  graphic: SmartGraphicModel;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const height = content.offsetHeight;
      if (!frame.clientWidth || !frame.clientHeight || !height) return;
      setScale(Math.min(frame.clientWidth / PREVIEW_WIDTH, frame.clientHeight / height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      data-testid="graphic-preview"
      className={cn('relative overflow-hidden', className)}
    >
      <div
        ref={contentRef}
        className="absolute left-1/2 top-1/2"
        style={{
          width: PREVIEW_WIDTH,
          transform: `translate(-50%, -50%) scale(${scale ?? 0.4})`,
          visibility: scale === null ? 'hidden' : undefined,
        }}
      >
        <SmartGraphicCanvas graphic={graphic} compact />
      </div>
    </div>
  );
});
