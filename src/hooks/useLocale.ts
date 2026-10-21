import { createContext, useContext } from 'react';
import { localeDirection, type Locale, type Translator } from '@/lib/translations';

export interface LocaleContextValue extends Translator {
  /** The language on screen (English while the chosen one's messages are missing). */
  locale: Locale;
  /**
   * The language the user chose (the stored preference, or the last switch,
   * which only happens once its messages load), also while its messages are
   * missing. For document choices that follow the user's region, like the
   * export's paper size and language.
   */
  requestedLocale: Locale;
  /** Resolves once the interface uses the locale; rejects if it could not load. */
  setLocale: (locale: Locale) => Promise<void>;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

/**
 * The interface direction, for primitives that set `dir` on their own
 * elements (Radix menus, selects, tabs and toggle groups default to LTR).
 * Outside a LocaleProvider it is LTR.
 */
export function useTextDirection(): 'ltr' | 'rtl' {
  const context = useContext(LocaleContext);
  return context ? localeDirection(context.locale) : 'ltr';
}
