import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadLocale, localeDirection, type Locale } from '@/lib/translations';
import { LocaleContext, type LocaleContextValue } from '@/hooks/useLocale';
import { useLocaleMessages } from '@/hooks/useLocaleMessages';
import { initialLocale, writeStoredLocale } from '@/lib/localePreference';

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const translator = useLocaleMessages(locale);
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

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, ...translator }),
    [locale, setLocale, translator],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
