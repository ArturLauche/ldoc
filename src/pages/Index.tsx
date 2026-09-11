import { ConfirmProvider } from '@/components/confirm-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RichTextEditor } from '@/components/Editor/RichTextEditor';
import { useSEO } from '@/hooks/useSEO';
import { siteConfig } from '@/lib/siteConfig';

import { pageMetadata } from '@/lib/siteMetadata';
import { useLocale } from '@/hooks/useLocale';

const Index = () => {
  const { locale } = useLocale();
  useSEO({ ...pageMetadata('/', siteConfig.siteUrl, siteConfig.siteName), language: locale });

  return (
    <ConfirmProvider>
      <TooltipProvider>
        <Toaster />
        <RichTextEditor />
      </TooltipProvider>
    </ConfirmProvider>
  );
};

export default Index;
