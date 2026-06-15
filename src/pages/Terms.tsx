import { LegalPageLayout } from '@/components/LegalPageLayout';
import { useLocale } from '@/components/locale-provider';
import { getTermsCopy } from '@/lib/legalContent';
import { useSEO } from '@/hooks/useSEO';

const Terms = () => {
  const { locale } = useLocale();
  const copy = getTermsCopy(locale);

  useSEO({
    title: `${copy.title} | LWrite`,
    description: copy.intro,
    canonicalPath: '/terms',
  });

  return <LegalPageLayout copy={copy} />;
};

export default Terms;
