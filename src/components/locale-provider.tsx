import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadLocale, localeDirection, type Locale } from '@/lib/translations';
import { LocaleContext, type LocaleContextValue } from '@/hooks/useLocale';
import { useLocaleMessages } from '@/hooks/useLocaleMessages';
import { initialLocale, writeStoredLocale } from '@/lib/localePreference';

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [requestedLocale, setLocaleState] = useState<Locale>(initialLocale);
  // The language on screen: English while the requested catalog is missing
  // (its download failed), so lang, dir and the menu match the text.
  const { shownLocale: locale, ...translator } = useLocaleMessages(requestedLocale);
  const latestRequest = useRef<Locale | null>(null);

  // The interface switches once the catalog is there, so it never shows a
  // half-English frame; a failed load keeps the current language.
  const setLocale = useCallback(async (next: Locale) => {
    latestRequest.current = next;
    await loadLocale(next);
    if (latestRequest.current !== next) return;
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection(locale);
  }, [locale]);

  const { t, tCount } = translator;
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, requestedLocale, setLocale, t, tCount }),
    [locale, requestedLocale, setLocale, t, tCount],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
