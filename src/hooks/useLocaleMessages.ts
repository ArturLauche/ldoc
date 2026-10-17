import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  createTranslator,
  loadLocale,
  loadedCatalog,
  subscribeCatalogs,
  type Locale,
  type Translator,
} from '@/lib/translations';
import { logWarning } from '@/lib/logger';

/**
 * Translators for the locale. They read English until the locale's catalog
 * has loaded (normally before the first render), then re-render with it.
 */
export function useLocaleMessages(locale: Locale): Translator {
  const getMessages = useCallback(() => loadedCatalog(locale), [locale]);
  const messages = useSyncExternalStore(subscribeCatalogs, getMessages, getMessages);

  useEffect(() => {
    if (messages) return;
    loadLocale(locale).catch((error: unknown) => {
      logWarning(`Messages for "${locale}" could not be loaded; showing English.`, error);
    });
  }, [locale, messages]);

  return useMemo(() => createTranslator(messages, locale), [locale, messages]);
}
