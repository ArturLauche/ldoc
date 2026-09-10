import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { useSEO } from '@/hooks/useSEO';
import { useLocale } from '@/hooks/useLocale';

export default function NotFound() {
  const { t, locale } = useLocale();
  useSEO({
    language: locale,
    title: '404 | LWrite',
    description: t('notFoundDescription'),
    noIndex: true,
  });
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-8 h-8 w-8" />
        <h1 className="text-3xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
        <p className="mt-3 text-base text-muted-foreground">{t('notFoundDescription')}</p>
        <Button asChild className="mt-7">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('legalBackToEditor')}
          </Link>
        </Button>
      </div>
    </main>
  );
}
