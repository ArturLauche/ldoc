import en from './locales/en.ts';

export type Locale = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ja' | 'zh' | 'ar' | 'ru';

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  ja: '日本語',
  zh: '中文',
  ar: 'العربية',
  ru: 'Русский',
};

export type TranslationKey = keyof typeof en;

/** Writing direction of the interface in this locale. */
export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Messages that read a count and so need the language's plural forms. */
export const COUNT_MESSAGES = [
  'wordCount',
  'characterCount',
  'selectedWords',
  'exportedLibraryToast',
  'replacedAllToast',
  'graphicMinItemsReason',
] as const satisfies readonly TranslationKey[];
export type CountMessage = (typeof COUNT_MESSAGES)[number];
type PluralForm = 'Zero' | 'One' | 'Two' | 'Few' | 'Many';
type PluralKey = `${CountMessage}${PluralForm}`;

/**
 * A locale's messages. English (`./locales/en.ts`) is complete; other locales
 * may omit keys, which then fall back to English (and finally to the key).
 * Count messages take `<key>One`, `<key>Few` … for the plural categories of
 * the language (Intl.PluralRules); `<key>` itself is the "other" form, and
 * `<key>Zero` (when present) is used for exactly 0.
 */
export type TranslationCatalog = Partial<Record<TranslationKey | PluralKey, string>>;

/**
 * Only English ships with the entry chunk. Each other catalog is its own
 * chunk; the entry point loads the active one before React mounts, and
 * switching languages loads the next one before the interface changes.
 */
const catalogLoaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: TranslationCatalog }>> = {
  es: () => import('./locales/es.ts'),
  fr: () => import('./locales/fr.ts'),
  de: () => import('./locales/de.ts'),
  it: () => import('./locales/it.ts'),
  pt: () => import('./locales/pt.ts'),
  nl: () => import('./locales/nl.ts'),
  ja: () => import('./locales/ja.ts'),
  zh: () => import('./locales/zh.ts'),
  ar: () => import('./locales/ar.ts'),
  ru: () => import('./locales/ru.ts'),
};

export const supportedLocales = Object.keys(localeNames) as Locale[];

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(localeNames, value);
}

const loadedCatalogs: Partial<Record<Locale, TranslationCatalog>> = { en };
const pendingCatalogs = new Map<Locale, Promise<TranslationCatalog>>();
const catalogListeners = new Set<() => void>();

/** The locale's messages if they have loaded, otherwise undefined. */
export function loadedCatalog(locale: Locale): TranslationCatalog | undefined {
  return loadedCatalogs[locale];
}

/** Loads a locale's messages once; a failed load can be retried. */
export function loadLocale(locale: Locale): Promise<TranslationCatalog> {
  const loaded = loadedCatalogs[locale];
  if (loaded) return Promise.resolve(loaded);
  if (locale === 'en') return Promise.resolve(en);
  let pending = pendingCatalogs.get(locale);
  if (!pending) {
    pending = catalogLoaders[locale]().then(
      ({ default: messages }) => {
        loadedCatalogs[locale] = messages;
        pendingCatalogs.delete(locale);
        for (const listener of catalogListeners) listener();
        return messages;
      },
      (error: unknown) => {
        pendingCatalogs.delete(locale);
        throw error;
      },
    );
    pendingCatalogs.set(locale, pending);
  }
  return pending;
}

/** Notifies when another catalog has finished loading. */
export function subscribeCatalogs(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

const normalizeToSupportedLocale = (languageTag: string): Locale | null => {
  const normalized = languageTag.toLowerCase();
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const baseLanguage = normalized.split('-')[0];
  if (isSupportedLocale(baseLanguage)) {
    return baseLanguage;
  }

  return null;
};

export const getBrowserLocale = (): Locale => {
  if (typeof window === 'undefined') return defaultLocale;

  const browserLocales =
    window.navigator.languages.length > 0
      ? window.navigator.languages
      : [window.navigator.language];

  for (const browserLocale of browserLocales) {
    const matchedLocale = normalizeToSupportedLocale(browserLocale);
    if (matchedLocale) {
      return matchedLocale;
    }
  }

  return defaultLocale;
};

/** Looks a key up in the given messages, falling back to English. */
export function translateFrom(messages: TranslationCatalog | undefined, key: TranslationKey): string {
  return messages?.[key] ?? en[key] ?? key;
}

/** Translates with the locale's messages if loaded; English until then. */
export const t = (locale: Locale, key: TranslationKey): string =>
  translateFrom(loadedCatalogs[locale], key);

// Intl objects are costly to build; counts re-render while typing, so reuse them.
const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function pluralRulesFor(locale: string): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRules.set(locale, rules);
  }
  return rules;
}

/** `value.toLocaleString(locale)` with a shared formatter. */
export function formatNumber(value: number, locale: string): string {
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale);
    numberFormats.set(locale, format);
  }
  return format.format(value);
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** Hours and minutes in the locale's style, with a shared formatter. */
export function formatTime(date: Date, locale: string): string {
  let format = timeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
    timeFormats.set(locale, format);
  }
  return format.format(date);
}

const PLURAL_FORMS: Record<Intl.LDMLPluralRule, PluralForm | null> = {
  zero: 'Zero',
  one: 'One',
  two: 'Two',
  few: 'Few',
  many: 'Many',
  other: null,
};

/**
 * A count message in the plural form `count` needs in the locale, with
 * `{count}` (and any other values) filled in. A locale without its own
 * message uses English with English plural rules, never a mix of the two.
 */
export function translateCount(
  messages: TranslationCatalog | undefined,
  locale: Locale,
  key: CountMessage,
  count: number,
  values: Record<string, string | number> = {},
): string {
  const own = messages?.[key] !== undefined;
  const source: TranslationCatalog = own && messages ? messages : en;
  const form = PLURAL_FORMS[pluralRulesFor(own ? locale : 'en').select(count)];
  // Exactly 0 may read differently from its plural category ("0 palavras",
  // not the singular CLDR gives Portuguese).
  const template =
    (count === 0 && source[`${key}Zero`]) ||
    (form && source[`${key}${form}`]) ||
    source[key] ||
    key;
  return formatMessage(template, { count: formatNumber(count, locale), ...values });
}

/** Replaces `{placeholder}` tokens in a translated message with concrete values. */
export function formatMessage(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.split(`{${key}}`).join(String(value)),
    template,
  );
}

export interface Translator {
  t: (key: TranslationKey) => string;
  /** A count message in the right plural form; `{count}` is filled in. */
  tCount: (key: CountMessage, count: number, values?: Record<string, string | number>) => string;
}

/** Translators over the given messages (English where they have no entry). */
export function createTranslator(messages: TranslationCatalog | undefined, locale: Locale): Translator {
  return {
    t: (key) => translateFrom(messages, key),
    tCount: (key, count, values) => translateCount(messages, locale, key, count, values),
  };
}
