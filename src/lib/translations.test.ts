import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from './locales/en.ts';
import {
  COUNT_MESSAGES,
  formatMessage,
  isSupportedLocale,
  loadLocale,
  supportedLocales,
  translateCount,
  type TranslationCatalog,
} from './translations';

/** Interface source (no catalogs, no tests) that reads translation keys. */
function interfaceSource(): string {
  // Vitest runs from the repository root (import.meta.url is not a file URL under jsdom).
  const root = `${resolve('src')}/`;
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(
    (file) =>
      /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file) && !/(^|\/)(locales|test)\//.test(file),
  );
  return [
    ...files.map((file) => readFileSync(`${root}${file}`, 'utf8')),
    readFileSync(resolve('build/staticPages.ts'), 'utf8'),
  ].join('\n');
}

const placeholders = (message: string) => (message.match(/\{\w+\}/g) ?? []).sort();
/** The English message a key translates; plural forms share their base message. */
const PLURAL_VARIANT = new RegExp(`^(${COUNT_MESSAGES.join('|')})(Zero|One|Two|Few|Many)$`);
const source = (key: string) =>
  (en as Record<string, string>)[key] ??
  (en as Record<string, string>)[key.replace(PLURAL_VARIANT, '$1')];

describe('translations', () => {
  afterEach(() => {
    vi.doUnmock('./locales/ja');
    vi.resetModules();
  });

  it('accepts only the supported locale codes', () => {
    expect(supportedLocales).toEqual(['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ja', 'zh', 'ar', 'ru']);
    expect(isSupportedLocale('de')).toBe(true);
    for (const value of ['toString', '__proto__', 'constructor', 'DE', '', 42, null]) {
      expect(isSupportedLocale(value)).toBe(false);
    }
  });

  it('keeps every placeholder of the English message in each translation', async () => {
    for (const locale of supportedLocales) {
      const messages = await loadLocale(locale);
      for (const [key, message] of Object.entries(messages) as [string, string][]) {
        expect(message.trim(), `${locale}.${key}`).not.toBe('');
        expect(placeholders(message), `${locale}.${key}`).toEqual(placeholders(source(key)));
      }
    }
  });

  it('shows English until a catalog loads, then the locale, loading it once', async () => {
    vi.resetModules();
    const fresh = await import('./translations');
    expect(fresh.loadedCatalog('fr')).toBeUndefined();
    expect(fresh.t('fr', 'placeholder')).toBe(en.placeholder);

    const listener = vi.fn();
    const unsubscribe = fresh.subscribeCatalogs(listener);
    const first = fresh.loadLocale('fr');
    expect(fresh.loadLocale('fr')).toBe(first);
    await first;
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fresh.t('fr', 'placeholder')).toBe('Commencez à écrire…');
    // Keys the locale has not translated still read English.
    expect(fresh.translateFrom({}, 'savedLocally')).toBe(en.savedLocally);
  });

  it('lets a failed catalog load be retried', async () => {
    vi.resetModules();
    vi.doMock('./locales/ja', () => {
      throw new Error('offline');
    });
    const fresh = await import('./translations');
    await expect(fresh.loadLocale('ja')).rejects.toThrow();
    expect(fresh.loadedCatalog('ja')).toBeUndefined();

    vi.doUnmock('./locales/ja');
    vi.resetModules();
    const retried = await import('./translations');
    await expect(retried.loadLocale('ja')).resolves.toMatchObject({ placeholder: expect.any(String) });
  });

  it('picks the plural form the language needs for a count', () => {
    const russian: TranslationCatalog = {
      wordCount: '{count} слова',
      wordCountOne: '{count} слово',
      wordCountFew: '{count} слова',
      wordCountMany: '{count} слов',
    };
    const forms = [1, 3, 5, 21, 1.5].map((count) => translateCount(russian, 'ru', 'wordCount', count));
    expect(forms).toEqual(['1 слово', '3 слова', '5 слов', '21 слово', '1,5 слова']);

    expect(translateCount(undefined, 'en', 'wordCount', 1)).toBe('1 word');
    expect(translateCount(undefined, 'en', 'wordCount', 1200)).toBe('1,200 words');
    expect(
      translateCount(undefined, 'en', 'selectedWords', 9, { selected: 2, total: 9 }),
    ).toBe('2 of 9 words');
  });

  it('uses an exact-zero form where the language has one', () => {
    const portuguese: TranslationCatalog = {
      wordCount: '{count} palavras',
      wordCountOne: '{count} palavra',
      wordCountZero: '{count} palavras',
    };
    // CLDR puts 0 in Portuguese "one"; the zero form keeps it plural.
    expect(translateCount(portuguese, 'pt', 'wordCount', 0)).toBe('0 palavras');
    expect(translateCount(portuguese, 'pt', 'wordCount', 1)).toBe('1 palavra');
    expect(translateCount(undefined, 'en', 'replacedAllToast', 1)).toBe('Replaced 1 match');
    expect(translateCount(undefined, 'en', 'replacedAllToast', 0)).toBe('Replaced 0 matches');
  });

  it('uses English with English plural rules for an untranslated count message', () => {
    // Russian "few" has no English counterpart: the English "other" form applies.
    expect(translateCount({}, 'ru', 'characterCount', 3)).toBe('3 characters');
    expect(translateCount({}, 'ru', 'characterCount', 1)).toBe('1 character');
  });

  it('has no English messages the interface never shows', () => {
    const source = interfaceSource();
    const unused = Object.keys(en).filter(
      (key) =>
        !PLURAL_VARIANT.test(key) &&
        !source.includes(`'${key}'`) &&
        !source.includes(`"${key}"`),
    );
    expect(unused).toEqual([]);
  });

  it('fills placeholders', () => {
    expect(formatMessage('{count} of {total}', { count: 2, total: 5 })).toBe('2 of 5');
  });
});
