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
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-6 h-8 w-8" />
        <p className="text-sm font-medium tabular-nums text-muted-foreground">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('notFoundTitle')}</h1>
        <p className="mt-2 text-muted-foreground">{t('notFoundDescription')}</p>
        <Button asChild className="mt-6">
          <Link to="/">
            <ArrowLeft className="rtl:rotate-180" />
            {t('legalBackToEditor')}
          </Link>
        </Button>
      </div>
    </main>
  );
}
