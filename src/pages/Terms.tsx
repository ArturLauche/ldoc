import { useLocation } from 'react-router-dom';
import { LegalPageLayout } from '@/components/LegalPageLayout';
import { getTermsCopy } from '@/lib/legalContent';
import { siteConfig } from '@/lib/siteConfig';
import { pageMetadata } from '@/lib/siteMetadata';
import { useSEO } from '@/hooks/useSEO';

export default function Terms() {
  const { pathname } = useLocation();
  const locale = pathname.toLowerCase().replace(/\/+$/, '') === '/nutzung' ? 'de' : 'en';
  const path = locale === 'de' ? '/nutzung' : '/terms';
  useSEO(pageMetadata(path, siteConfig.siteUrl, siteConfig.siteName, siteConfig.lastUpdated));
  return <LegalPageLayout copy={getTermsCopy(locale)} locale={locale} />;
}
