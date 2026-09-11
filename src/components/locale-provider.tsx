import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  getBrowserLocale,
  t as translate,
  type Locale,
  type TranslationKey,
} from '@/lib/translations';
import { LocaleContext, type LocaleContextValue } from '@/hooks/useLocale';
import { readStoredLocale, writeStoredLocale } from '@/lib/localePreference';

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale() ?? getBrowserLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: TranslationKey) => translate(locale, key),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
