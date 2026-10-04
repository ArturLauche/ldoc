import { useMemo, useState } from 'react';
import { useLocale } from '@/hooks/useLocale';
import {
  SMART_GRAPHIC_CATEGORIES,
  getSmartGraphicLayout,
  layoutsForCategory,
  switchGraphicLayout,
  type SmartGraphicCategory,
  type SmartGraphicLayoutId,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { cn } from '@/lib/utils';
import { GRAPHIC_CATEGORY_KEYS, GRAPHIC_LAYOUT_KEYS } from '../smartGraphicLabels';
import { LayoutCard } from './LayoutCard';

/**
 * Layout switcher shown in a popover. Thumbnails render the user's own
 * content in each layout, so the result of a switch is visible up front.
 */
export function LayoutPicker({
  graphic,
  onChange,
}: {
  graphic: SmartGraphicModel;
  onChange: (layoutId: SmartGraphicLayoutId) => void;
}) {
  const { t, locale } = useLocale();
  const [category, setCategory] = useState<SmartGraphicCategory>(
    () => getSmartGraphicLayout(graphic.layoutId).category,
  );
  const previews = useMemo(
    () =>
      layoutsForCategory(category).map((layout) => ({
        layout,
        preview: switchGraphicLayout(graphic, layout.id, locale),
      })),
    [category, graphic, locale],
  );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-foreground">{t('graphicChangeLayout')}</p>
        <p className="text-xs text-muted-foreground">{t('graphicLayoutKeepsText')}</p>
      </div>
      <div
        role="group"
        aria-label={t('graphicGalleryCategories')}
        className="scroll-strip -mx-3 flex gap-1 px-3 pb-0.5"
      >
        {SMART_GRAPHIC_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={item === category}
            onClick={() => setCategory(item)}
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-9',
              item === category
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t(GRAPHIC_CATEGORY_KEYS[item])}
          </button>
        ))}
      </div>
      <div className="grid max-h-[min(22rem,50vh)] grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-0.5 sm:grid-cols-3">
        {previews.map(({ layout, preview }) => (
          <LayoutCard
            key={layout.id}
            size="small"
            name={t(GRAPHIC_LAYOUT_KEYS[layout.id])}
            preview={preview}
            selected={layout.id === graphic.layoutId}
            selectedLabel={t('graphicLayoutCurrent')}
            onSelect={() => onChange(layout.id)}
          />
        ))}
      </div>
    </div>
  );
}
