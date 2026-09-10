import { useEffect } from 'react';
import { siteConfig } from '@/lib/siteConfig';

export type HreflangAlternate = {
  /** BCP 47 / hreflang value, e.g. "en", "de" or "x-default". */
  hreflang: string;
  /** Absolute URL or site-absolute path (resolved against the public site URL). */
  href: string;
};

type SeoConfig = {
  language?: string;
  title: string;
  description: string;
  canonicalPath?: string;
  noIndex?: boolean;
  ogType?: 'website' | 'article';
  structuredData?: Record<string, unknown>;
  /** hreflang alternates (e.g. EN primary <-> DE alias on legal pages). */
  alternates?: HreflangAlternate[];
  /** Open Graph locale, e.g. "en_US". Defaults to en_US. */
  ogLocale?: string;
  /** Alternate OG locales advertised alongside og:locale. */
  ogLocaleAlternates?: string[];
  /** Alt text for the social share image. */
  imageAlt?: string;
  /** ISO-8601 timestamps for article pages (legal pages). */
  modifiedTime?: string;
  publishedTime?: string;
};

const SITE_NAME = siteConfig.siteName;
const OG_IMAGE_WIDTH = '1200';
const OG_IMAGE_HEIGHT = '630';
const OG_IMAGE_TYPE = 'image/png';
const DEFAULT_OG_LOCALE = 'en_US';
const DEFAULT_OG_LOCALE_ALTERNATES = ['de_DE'];

const STRUCTURED_DATA_ID = 'ldoc-structured-data';

const resolvePublicUrl = (pathOrUrl: string): string => {
  try {
    return new URL(pathOrUrl, siteConfig.siteUrl).toString();
  } catch {
    return pathOrUrl;
  }
};

const defaultImage = (): string => resolvePublicUrl('/og-image.png');

const upsertMeta = (selector: string, attributes: Record<string, string>) => {
  const head = document.head;
  let element = head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
};

const removeMeta = (selector: string) => {
  document.head.querySelector(selector)?.remove();
};

const upsertLink = (selector: string, attributes: Record<string, string>) => {
  const head = document.head;
  let element = head.querySelector<HTMLLinkElement>(selector);

  if (!element) {
    element = document.createElement('link');
    head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value);
  });
};

const upsertJsonLd = (id: string, data: Record<string, unknown>) => {
  const head = document.head;
  let script = head.querySelector<HTMLScriptElement>(`script#${id}`);

  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
};

const syncAlternates = (alternates: HreflangAlternate[]) => {
  const head = document.head;
  const wanted = new Map(
    alternates.map((alternate) => [
      alternate.hreflang.toLowerCase(),
      resolvePublicUrl(alternate.href),
    ]),
  );

  head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]').forEach((element) => {
    const hreflang = (element.getAttribute('hreflang') ?? '').toLowerCase();
    const expected = wanted.get(hreflang);
    if (expected === undefined || element.getAttribute('href') !== expected) {
      element.remove();
    } else {
      // Already correct — keep it and drop from the insert set.
      wanted.delete(hreflang);
    }
  });

  wanted.forEach((href, hreflang) => {
    const element = document.createElement('link');
    element.setAttribute('rel', 'alternate');
    element.setAttribute('hreflang', hreflang);
    element.setAttribute('href', href);
    head.appendChild(element);
  });
};

export const useSEO = ({
  title,
  language,
  description,
  canonicalPath,
  noIndex = false,
  ogType = 'website',
  structuredData,
  alternates = [],
  ogLocale = DEFAULT_OG_LOCALE,
  ogLocaleAlternates = DEFAULT_OG_LOCALE_ALTERNATES,
  imageAlt = 'LWrite – free private online rich text editor',
  modifiedTime,
  publishedTime,
}: SeoConfig) => {
  useEffect(() => {
    // Runtime metadata follows the current host; static build metadata uses
    // the deployment origin configured in build/staticPages.ts.
    const canonicalUrl = resolvePublicUrl(canonicalPath ?? '/');
    const imageUrl = defaultImage();

    document.title = title;
    if (language) {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }
    document.head
      .querySelectorAll('meta[property="og:locale:alternate"]')
      .forEach((element) => element.remove());

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noIndex ? 'noindex,nofollow' : 'index,follow',
    });

    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: ogType });
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: ogLocale });
    for (const alternate of ogLocaleAlternates) {
      upsertMeta(`meta[property="og:locale:alternate"][content="${alternate}"]`, {
        property: 'og:locale:alternate',
        content: alternate,
      });
    }
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl });
    upsertMeta('meta[property="og:image:width"]', {
      property: 'og:image:width',
      content: OG_IMAGE_WIDTH,
    });
    upsertMeta('meta[property="og:image:height"]', {
      property: 'og:image:height',
      content: OG_IMAGE_HEIGHT,
    });
    upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: imageAlt });
    upsertMeta('meta[property="og:image:type"]', {
      property: 'og:image:type',
      content: OG_IMAGE_TYPE,
    });

    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl });
    upsertMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt', content: imageAlt });

    if (ogType === 'article') {
      if (publishedTime) {
        upsertMeta('meta[property="article:published_time"]', {
          property: 'article:published_time',
          content: publishedTime,
        });
      } else {
        removeMeta('meta[property="article:published_time"]');
      }
      if (modifiedTime) {
        upsertMeta('meta[property="article:modified_time"]', {
          property: 'article:modified_time',
          content: modifiedTime,
        });
      } else {
        removeMeta('meta[property="article:modified_time"]');
      }
    } else {
      removeMeta('meta[property="article:published_time"]');
      removeMeta('meta[property="article:modified_time"]');
    }

    if (noIndex && !canonicalPath) {
      document.head.querySelector('link[rel="canonical"]')?.remove();
      removeMeta('meta[property="og:url"]');
    } else {
      upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl });
    }

    syncAlternates(alternates);

    if (structuredData) {
      upsertJsonLd(STRUCTURED_DATA_ID, structuredData);
    } else {
      // Pages without their own structured data (e.g. the 404 page) must not
      // inherit a previous route's JSON-LD during SPA navigation, or they would
      // be indexed with stale, page-specific structured data.
      document.head.querySelector(`script#${STRUCTURED_DATA_ID}`)?.remove();
    }
  }, [
    alternates,
    canonicalPath,
    description,
    imageAlt,
    language,
    modifiedTime,
    noIndex,
    ogLocale,
    ogLocaleAlternates,
    ogType,
    publishedTime,
    structuredData,
    title,
  ]);
};
