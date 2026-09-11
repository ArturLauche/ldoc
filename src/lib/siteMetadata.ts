/** Public route metadata shared by the browser and static build output. */
export const DEFAULT_SITE_URL = 'https://write.leunos.com';
export const PUBLIC_PATHS = ['/', '/privacy', '/terms', '/datenschutz', '/nutzung'] as const;
export const HOME_TITLE = 'LWrite – Free Online Rich Text Editor | Private, No Sign-up';
export const HOME_DESCRIPTION =
  'Free private online rich text editor in your browser. Write, format & export DOCX, PDF, ODT — no sign-up, with autosave and version history.';

export function safeSiteOrigin(value: string | undefined, fallback = DEFAULT_SITE_URL): string {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.origin
      : fallback;
  } catch {
    return fallback;
  }
}

export function pageMetadata(
  path: string,
  origin: string,
  siteName = 'LWrite',
  lastUpdated = '2026-06-16',
) {
  const german = path === '/datenschutz' || path === '/nutzung';
  const language = german ? 'de' : 'en';
  const privacy = path === '/privacy' || path === '/datenschutz';
  const terms = path === '/terms' || path === '/nutzung';
  const home = path === '/';
  const noIndex = !home && !privacy && !terms;
  const title = home
    ? HOME_TITLE.replace('LWrite', siteName)
    : noIndex
      ? `404 | ${siteName}`
      : `${privacy ? (german ? 'Datenschutz' : 'Privacy Policy') : german ? 'Nutzungsbedingungen' : 'Terms of Use'} | ${siteName}`;
  const description = home
    ? HOME_DESCRIPTION
    : noIndex
      ? 'The page you requested could not be found.'
      : privacy
        ? german
          ? 'Wie LWrite Dokumente lokal speichert, welche Daten beim Besuch der Website anfallen und wie du den Betreiber erreichst.'
          : 'How LWrite stores documents locally, what data is processed when you visit, and how to contact the operator.'
        : german
          ? 'Nutzungsbedingungen für LWrite: lokale Speicherung, Sicherungen, Importe, Exporte und die Nutzung des kostenlosen Editors.'
          : 'Terms for using LWrite, including local storage, backups, imports, exports, and use of the free editor.';
  const alternates =
    home || noIndex
      ? []
      : [
          { hreflang: 'en', href: privacy ? '/privacy' : '/terms' },
          { hreflang: 'de', href: privacy ? '/datenschutz' : '/nutzung' },
          { hreflang: 'x-default', href: privacy ? '/privacy' : '/terms' },
        ];
  const url = new URL(path, origin).href;
  const structuredData: Record<string, unknown> | undefined = noIndex
    ? undefined
    : {
        '@context': 'https://schema.org',
        '@graph': home
          ? [
              {
                '@type': 'WebApplication',
                name: siteName,
                url,
                applicationCategory: 'BusinessApplication',
                applicationSubCategory: 'Rich Text Editor',
                operatingSystem: 'Web browser',
                browserRequirements: 'Requires JavaScript.',
                description,
                isAccessibleForFree: true,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
                featureList:
                  'Rich text editing, local autosave, version history, document library, DOCX/PDF/ODT/RTF/HTML/TXT export',
                inLanguage: ['en', 'de', 'es', 'fr', 'it', 'pt', 'nl', 'ja', 'zh', 'ar', 'ru'],
              },
              { '@type': 'WebSite', name: siteName, url, inLanguage: ['en', 'de'] },
            ]
          : [
              {
                '@type': 'WebPage',
                name: title,
                description,
                url,
                inLanguage: language,
                dateModified: lastUpdated,
                isPartOf: { '@type': 'WebSite', name: siteName, url: origin },
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: siteName, item: origin },
                  { '@type': 'ListItem', position: 2, name: title, item: url },
                ],
              },
            ],
      };
  return {
    title,
    description,
    canonicalPath: noIndex ? undefined : path,
    noIndex,
    language,
    ogLocale: german ? 'de_DE' : 'en_US',
    ogLocaleAlternates: [german ? 'en_US' : 'de_DE'],
    alternates,
    structuredData,
  };
}
