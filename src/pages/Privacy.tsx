import { useLocation } from 'react-router-dom';
import { LegalPageLayout } from '@/components/LegalPageLayout';
import { getPrivacyCopy } from '@/lib/legalContent';
import { siteConfig } from '@/lib/siteConfig';
import { pageMetadata } from '@/lib/siteMetadata';
import { useSEO } from '@/hooks/useSEO';
import { legalPageLocale } from '@/routeLoading';

export default function Privacy() {
  const { pathname } = useLocation();
  const locale = legalPageLocale(pathname);
  const path = locale === 'de' ? '/datenschutz' : '/privacy';
  useSEO(pageMetadata(path, siteConfig.siteUrl, siteConfig.siteName, siteConfig.lastUpdated));
  return <LegalPageLayout copy={getPrivacyCopy(locale)} locale={locale} />;
}
