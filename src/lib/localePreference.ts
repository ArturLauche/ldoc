import { isSupportedLocale, type Locale } from './translations';
import { readStorageItem, writeStorageItem } from './storage';

export const LOCALE_STORAGE_KEY = 'lwrite-locale';

export function readStoredLocale(): Locale | null {
  const result = readStorageItem(LOCALE_STORAGE_KEY);
  if (!result.ok || !result.value) return null;
  return isSupportedLocale(result.value) ? result.value : null;
}

export function writeStoredLocale(locale: Locale): void {
  // A failed write only loses the preference, never document data; ignore it.
  writeStorageItem(LOCALE_STORAGE_KEY, locale);
}
