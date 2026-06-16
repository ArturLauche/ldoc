import { LegalPageLayout } from '@/components/LegalPageLayout';
import { useLocale } from '@/components/locale-provider';
import { getPrivacyCopy } from '@/lib/legalContent';
import { siteConfig } from '@/lib/siteConfig';
import { useSEO } from '@/hooks/useSEO';

const Privacy = () => {
  const { locale } = useLocale();
  const copy = getPrivacyCopy(locale);

  useSEO({
    title: `${copy.title} | ${siteConfig.siteName}`,
    description: copy.intro,
    canonicalPath: '/privacy',
  });

  return <LegalPageLayout copy={copy} />;
};

export default Privacy;
