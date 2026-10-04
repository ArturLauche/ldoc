import type { SmartGraphicLayoutDefinition } from '@/lib/smartGraphic';
import type { TranslationKey } from '@/lib/translations';
import { GRAPHIC_CATEGORY_KEYS, GRAPHIC_LAYOUT_HINT_KEYS, GRAPHIC_LAYOUT_KEYS } from '../smartGraphicLabels';

/** Case- and accent-insensitive form for matching ("Prozeß" ~ "prozess" is out of scope). */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * Matches a layout by its localized name, purpose or category; every word of
 * the query has to appear somewhere.
 */
export function layoutMatchesQuery(
  layout: SmartGraphicLayoutDefinition,
  query: string,
  translate: (key: TranslationKey) => string,
): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeSearchText(
    [
      translate(GRAPHIC_LAYOUT_KEYS[layout.id]),
      translate(GRAPHIC_LAYOUT_HINT_KEYS[layout.id]),
      translate(GRAPHIC_CATEGORY_KEYS[layout.category]),
    ].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}
