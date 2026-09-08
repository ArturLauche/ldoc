import { LegalPageLayout } from '@/components/LegalPageLayout';
import { useLocale } from '@/components/locale-provider';
import { getPrivacyCopy } from '@/lib/legalContent';
import { siteConfig } from '@/lib/siteConfig';
import { useSEO } from '@/hooks/useSEO';

const Privacy = () => {
  const { locale } = useLocale();
  const copy = getPrivacyCopy(locale);
  const canonicalPath = '/privacy';

  useSEO({
    title: `${copy.title} | ${siteConfig.siteName}`,
    description: copy.intro,
    canonicalPath,
    ogType: 'article',
    modifiedTime: siteConfig.lastUpdated,
    alternates: [
      { hreflang: 'x-default', href: '/privacy' },
      { hreflang: 'en', href: '/privacy' },
      { hreflang: 'de', href: '/datenschutz' },
    ],
    structuredData: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: `${copy.title} | ${siteConfig.siteName}`,
          description: copy.intro,
          url: new URL(canonicalPath, siteConfig.siteUrl).toString(),
          inLanguage: locale,
          dateModified: siteConfig.lastUpdated,
          isPartOf: { '@type': 'WebSite', name: siteConfig.siteName, url: siteConfig.siteUrl },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: siteConfig.siteName, item: siteConfig.siteUrl },
            {
              '@type': 'ListItem',
              position: 2,
              name: copy.title,
              item: new URL(canonicalPath, siteConfig.siteUrl).toString(),
            },
          ],
        },
      ],
    },
  });

  return <LegalPageLayout copy={copy} />;
};

export default Privacy;
