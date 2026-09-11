import { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/useLocale';
import { logError } from '@/lib/logger';

export function LoadError() {
  const { t } = useLocale();
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-md" role="alert">
        <BrandLogo className="mb-8 h-8 w-8" />
        <h1 className="text-2xl font-semibold tracking-tight">{t('appLoadFailed')}</h1>
        <p className="mt-3 text-muted-foreground">{t('appLoadFailedHint')}</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('reloadApp')}
        </Button>
      </div>
    </main>
  );
}

/** Keep route or deferred-chunk failures recoverable without clearing saved data. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    logError('The application could not be displayed', error);
  }
  render() {
    return this.state.failed ? <LoadError /> : this.props.children;
  }
}
