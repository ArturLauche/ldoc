import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A fresh module graph, so no catalog besides English has loaded yet. */
async function freshProvider() {
  vi.resetModules();
  const [{ LocaleProvider }, { useLocale }, translations] = await Promise.all([
    import('./locale-provider'),
    import('@/hooks/useLocale'),
    import('@/lib/translations'),
  ]);
  let api: ReturnType<typeof useLocale> | undefined;
  function Probe() {
    api = useLocale();
    return <p>{api.t('placeholder')}</p>;
  }
  render(
    <LocaleProvider>
      <Probe />
    </LocaleProvider>,
  );
  return { api: () => api!, translations };
}

describe('LocaleProvider', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/locales/ja');
    vi.doUnmock('@/lib/locales/ar');
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('switches once the next catalog has loaded and remembers the choice', async () => {
    const { api, translations } = await freshProvider();
    expect(screen.getByText('Start writing…')).toBeInTheDocument();
    expect(translations.loadedCatalog('ar')).toBeUndefined();

    await act(() => api().setLocale('ar'));

    expect(screen.getByText('ابدأ الكتابة…')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(window.localStorage.getItem('lwrite-locale')).toBe('ar');
  });

  it('keeps the current language when a catalog cannot load', async () => {
    vi.doMock('@/lib/locales/ja', () => {
      throw new Error('offline');
    });
    const { api } = await freshProvider();

    await act(async () => {
      await expect(api().setLocale('ja')).rejects.toThrow();
    });

    expect(api().locale).toBe('en');
    expect(screen.getByText('Start writing…')).toBeInTheDocument();
    expect(window.localStorage.getItem('lwrite-locale')).toBeNull();
  });

  it('loads a saved language that the entry point could not preload', async () => {
    window.localStorage.setItem('lwrite-locale', 'ru');
    const { api } = await freshProvider();
    expect(await screen.findByText('Начните писать…')).toBeInTheDocument();
    expect(api().locale).toBe('ru');
    expect(document.documentElement).toHaveAttribute('lang', 'ru');
  });

  it('labels the English fallback as English while a saved language is missing', async () => {
    vi.doMock('@/lib/locales/ar', () => {
      throw new Error('offline');
    });
    window.localStorage.setItem('lwrite-locale', 'ar');
    const { api } = await freshProvider();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByText('Start writing…')).toBeInTheDocument();
    // Not lang="ar" dir="rtl" around English text.
    expect(api().locale).toBe('en');
    // The choice still counts for the document (export paper size, language),
    // and numbers read like the English text around them.
    expect(api().requestedLocale).toBe('ar');
    expect(api().tCount('wordCount', 1500)).toBe('1,500 words');
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  });
});
