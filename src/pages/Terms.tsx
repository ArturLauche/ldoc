import { LegalPageLayout } from '@/components/LegalPageLayout';
import { useLocale } from '@/components/locale-provider';
import { getTermsCopy } from '@/lib/legalContent';
import { siteConfig } from '@/lib/siteConfig';
import { useSEO } from '@/hooks/useSEO';

const Terms = () => {
  const { locale } = useLocale();
  const copy = getTermsCopy(locale);

  useSEO({
    title: `${copy.title} | ${siteConfig.siteName}`,
    description: copy.intro,
    canonicalPath: '/terms',
  });

  return <LegalPageLayout copy={copy} />;
};

export default Terms;
