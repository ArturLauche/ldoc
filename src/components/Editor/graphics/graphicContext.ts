import { createContext, useContext, type CSSProperties, type KeyboardEvent } from 'react';
import type { SmartGraphicStyle } from '@/lib/smartGraphic';

export interface GraphicRenderContextValue {
  /** Labels are editors (false for thumbnails and static renders). */
  editable: boolean;
  activeId: string | null;
  style: SmartGraphicStyle;
  /** Localized strings drawn inside diagrams; `emptyLabel` is per item (by level). */
  strings: { versus: string; overflow: string; emptyLabel: (id: string) => string };
  onSelectItem?: (id: string) => void;
  onChangeLabel?: (id: string, label: string) => void;
  onLabelKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>, id: string) => void;
}

export const GraphicRenderContext = createContext<GraphicRenderContextValue>({
  editable: false,
  activeId: null,
  style: 'filled',
  strings: { versus: 'vs', overflow: 'More items', emptyLabel: () => 'Text' },
});

export function useGraphicRender(): GraphicRenderContextValue {
  return useContext(GraphicRenderContext);
}

/** Palette fill for an item; palettes have six steps. */
export function fillVar(index: number): string {
  return `var(--sg-${(((index % 6) + 6) % 6) + 1})`;
}

export function tint(index: number, percent: number): string {
  return `color-mix(in srgb, ${fillVar(index)} ${percent}%, var(--sg-surface))`;
}

/** Main shape surface for an item in the chosen style. */
export function solidTone(style: SmartGraphicStyle, index: number): CSSProperties {
  const fill = fillVar(index);
  switch (style) {
    case 'outline':
      return { backgroundColor: 'var(--sg-surface)', color: 'hsl(var(--foreground))', boxShadow: `inset 0 0 0 2px ${fill}` };
    case 'subtle':
      return { backgroundColor: tint(index, 16), color: 'hsl(var(--foreground))', boxShadow: `inset 0 0 0 1px ${tint(index, 55)}` };
    case 'intense':
      return {
        backgroundImage: `linear-gradient(160deg, color-mix(in srgb, ${fill} 78%, var(--sg-on)), ${fill} 70%)`,
        backgroundColor: fill,
        color: 'var(--sg-on)',
        boxShadow: '0 10px 22px -12px hsl(var(--foreground) / 0.55)',
      };
    default:
      return { backgroundColor: fill, color: 'var(--sg-on)' };
  }
}

/** Small markers (numbers, dots, badges): stay solid except in the outline style. */
export function accentTone(style: SmartGraphicStyle, index: number): CSSProperties {
  const fill = fillVar(index);
  if (style === 'outline') {
    return { backgroundColor: 'var(--sg-surface)', color: 'hsl(var(--foreground))', boxShadow: `inset 0 0 0 2px ${fill}` };
  }
  if (style === 'subtle') {
    return { backgroundColor: tint(index, 26), color: 'hsl(var(--foreground))', boxShadow: `inset 0 0 0 1px ${tint(index, 70)}` };
  }
  return { backgroundColor: fill, color: 'var(--sg-on)' };
}

/** Neutral card with a colored edge, for detail-heavy layouts. */
export function cardTone(style: SmartGraphicStyle, index: number): CSSProperties {
  if (style === 'filled' || style === 'intense') {
    return {
      backgroundColor: tint(index, 9),
      color: 'hsl(var(--foreground))',
      boxShadow:
        style === 'intense'
          ? `inset 0 0 0 1px ${tint(index, 35)}, 0 10px 22px -14px hsl(var(--foreground) / 0.45)`
          : `inset 0 0 0 1px ${tint(index, 35)}`,
    };
  }
  return solidTone(style, index);
}

/** Fill and edge colors for shapes drawn as layers (clip-path, SVG). */
export function shapeColors(style: SmartGraphicStyle, index: number): { fill: string; edge: string | null; text: string } {
  const fill = fillVar(index);
  switch (style) {
    case 'outline':
      return { fill: 'var(--sg-surface)', edge: fill, text: 'hsl(var(--foreground))' };
    case 'subtle':
      return { fill: tint(index, 18), edge: tint(index, 60), text: 'hsl(var(--foreground))' };
    default:
      return { fill, edge: null, text: 'var(--sg-on)' };
  }
}

/** Text color that sits on a `ShapeLayer` in the current style. */
export function useShapeText(index: number): string {
  const { style } = useGraphicRender();
  return shapeColors(style, index).text;
}
