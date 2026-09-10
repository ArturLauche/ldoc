import { RichTextEditor } from '@/components/Editor/RichTextEditor';
import { useSEO } from '@/hooks/useSEO';
import { siteConfig } from '@/lib/siteConfig';

import { pageMetadata } from '@/lib/siteMetadata';
import { useLocale } from '@/hooks/useLocale';

const Index = () => {
  const { locale } = useLocale();
  useSEO({ ...pageMetadata('/', siteConfig.siteUrl, siteConfig.siteName), language: locale });

  return <RichTextEditor />;
};

export default Index;
