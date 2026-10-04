import type { SmartGraphicItem } from '@/lib/smartGraphic';

export interface LayoutRendererProps {
  /** Top-level items the layout can draw (extra ones render as overflow). */
  items: SmartGraphicItem[];
}
