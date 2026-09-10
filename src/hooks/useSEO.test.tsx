import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSEO } from './useSEO';

const metaContent = (selector: string): string | null =>
  document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute('content') ?? null;

const linkHref = (selector: string): string | null =>
  document.head.querySelector<HTMLLinkElement>(selector)?.getAttribute('href') ?? null;

beforeEach(() => {
  document.title = '';
  document.head.innerHTML = '';
});

describe('useSEO', () => {
  it('sets title, description, canonical and self-hosted social tags', () => {
    renderHook(() =>
      useSEO({
        title: 'LWrite – Free Online Rich Text Editor | Private, No Sign-up',
        description: 'Free private editor.',
        canonicalPath: '/',
      }),
    );

    expect(document.title).toBe('LWrite – Free Online Rich Text Editor | Private, No Sign-up');
    expect(metaContent('meta[name="description"]')).toBe('Free private editor.');
    expect(metaContent('meta[name="robots"]')).toBe('index,follow');
    expect(linkHref('link[rel="canonical"]')).toBe('http://localhost/');
    expect(metaContent('meta[property="og:url"]')).toBe('http://localhost/');
    expect(metaContent('meta[property="og:type"]')).toBe('website');
    expect(metaContent('meta[property="og:locale"]')).toBe('en_US');

    // Social image must be self-hosted (same origin), never a third-party URL.
    const ogImage = metaContent('meta[property="og:image"]') ?? '';
    expect(ogImage).toContain('/og-image.png');
    expect(ogImage.startsWith('http://localhost/')).toBe(true);
    expect(metaContent('meta[property="og:image:width"]')).toBe('1200');
    expect(metaContent('meta[property="og:image:height"]')).toBe('630');
    expect(metaContent('meta[name="twitter:image"]')).toBe(ogImage);
  });

  it('marks noindex pages and never leaves stale JSON-LD behind', () => {
    const { rerender } = renderHook(
      ({ withData }: { withData: boolean }) =>
        useSEO({
          title: 'Privacy Policy | LWrite',
          description: 'Privacy intro.',
          canonicalPath: '/privacy',
          noIndex: true,
          structuredData: withData
            ? { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Privacy' }
            : undefined,
        }),
      { initialProps: { withData: true } },
    );

    expect(metaContent('meta[name="robots"]')).toBe('noindex,nofollow');
    expect(document.head.querySelector('script#ldoc-structured-data')).not.toBeNull();

    rerender({ withData: false });

    expect(document.head.querySelector('script#ldoc-structured-data')).toBeNull();
  });

  it('manages hreflang alternates and cleans up stale entries', () => {
    const { rerender } = renderHook(
      ({ deHref }: { deHref: string }) =>
        useSEO({
          title: 'Privacy Policy | LWrite',
          description: 'Privacy intro.',
          canonicalPath: '/privacy',
          alternates: [
            { hreflang: 'x-default', href: '/privacy' },
            { hreflang: 'en', href: '/privacy' },
            { hreflang: 'de', href: deHref },
          ],
        }),
      { initialProps: { deHref: '/datenschutz' } },
    );

    expect(linkHref('link[rel="alternate"][hreflang="de"]')).toBe('http://localhost/datenschutz');

    rerender({ deHref: '/nutzung' });

    expect(linkHref('link[rel="alternate"][hreflang="de"]')).toBe('http://localhost/nutzung');
    expect(linkHref('link[rel="alternate"][hreflang="en"]')).toBe('http://localhost/privacy');
    expect(document.head.querySelectorAll('link[rel="alternate"][hreflang="de"]')).toHaveLength(1);
  });

  it('sets article timestamps only for article pages', () => {
    const { rerender } = renderHook(
      ({ ogType }: { ogType: 'website' | 'article' }) =>
        useSEO({
          title: 'Terms of Use | LWrite',
          description: 'Terms intro.',
          canonicalPath: '/terms',
          ogType,
          modifiedTime: '2026-06-16',
        }),
      { initialProps: { ogType: 'article' as 'website' | 'article' } },
    );

    expect(metaContent('meta[property="article:modified_time"]')).toBe('2026-06-16');

    rerender({ ogType: 'website' });

    expect(document.head.querySelector('meta[property="article:modified_time"]')).toBeNull();
  });
});

it('cleans stale OG locales and removes the canonical tag for a missing page', () => {
  const { rerender } = renderHook(
    ({ missing }) =>
      useSEO({
        title: 'Page',
        description: 'Description',
        noIndex: missing,
        canonicalPath: missing ? undefined : '/',
        ogLocaleAlternates: missing ? [] : ['de_DE'],
      }),
    { initialProps: { missing: false } },
  );
  rerender({ missing: true });
  expect(document.head.querySelector('meta[property="og:locale:alternate"]')).toBeNull();
  expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
});
