import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAndroidUpdater } from '@/hooks/useAndroidUpdater';
import { useLocale } from '@/hooks/useLocale';
import { NativeUpdater, type UpdatePhase } from '@/lib/native/bridge';
import { updateProgress } from '@/lib/native/updates';
import { prepareNativeDeparture } from '@/lib/native/lifecycle';
import { formatMessage, type TranslationKey } from '@/lib/translations';

const STATUS_KEYS: Record<UpdatePhase, TranslationKey> = {
  disabled: 'androidDevelopmentBuild', idle: 'androidUpdateIdle', checking: 'androidUpdateChecking',
  current: 'androidUpdateCurrent', downloading: 'androidUpdateDownloading', ready: 'androidUpdateReady', error: 'androidUpdateError',
};

export function AndroidUpdates() {
  const { t, locale } = useLocale();
  const { state, check, bridgeError } = useAndroidUpdater();
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const install = async () => {
    setInstalling(true);
    try {
      if (!(await prepareNativeDeparture())) {
        toast.error(t('saveFailed'));
        return;
      }
      const result = await NativeUpdater.install();
      if (result.permissionRequired) toast.info(t('androidInstallPermission'));
    } catch {
      toast.error(t('androidInstallFailed'));
    } finally {
      setInstalling(false);
    }
  };
  const busy = state?.phase === 'checking' || state?.phase === 'downloading';
  const status = state ? t(STATUS_KEYS[state.phase]) : t('androidUpdateIdle');
  return (
    <>
      <Button variant="ghost" size="sm" className="h-auto max-w-full gap-2 whitespace-normal text-xs" onClick={() => setOpen(true)}>
        <Download className="h-3.5 w-3.5 shrink-0" />
        {state?.phase === 'ready' ? formatMessage(t('androidUpdateAvailable'), { version: state.availableVersion ?? '' }) : t('androidUpdates')}
        {state?.phase === 'downloading' ? ` ${updateProgress(state)}%` : ''}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('androidUpdates')}</DialogTitle>
            <DialogDescription>{t('androidUpdateDescription')}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t('androidInstalledVersion')}</dt><dd className="break-all">{state?.installedVersion ?? '…'}</dd>
            {state?.availableVersion ? <><dt className="text-muted-foreground">{t('androidAvailableVersion')}</dt><dd>{state.availableVersion}</dd></> : null}
            {state?.lastChecked ? <><dt className="text-muted-foreground">{t('androidLastChecked')}</dt><dd>{new Date(state.lastChecked).toLocaleString(locale)}</dd></> : null}
          </dl>
          <p role="status" aria-live="polite" className="text-sm">{bridgeError ? t('androidUpdateError') : status}</p>
          {state?.phase === 'downloading' ? <progress className="h-2 w-full accent-primary" aria-label={t('androidUpdateDownloading')} value={updateProgress(state)} max={100} /> : null}
          {state?.phase === 'error' ? <p className="text-sm text-muted-foreground">{t(state.error === 'integrity' || state.error === 'incompatible' ? 'androidUpdateRejected' : 'androidUpdateRetry')}</p> : null}
          {state?.phase === 'ready' ? <>
            <p className="text-sm text-muted-foreground">{t('androidInstallPermission')}</p>
            <Button onClick={() => void install()} disabled={installing}>{t('androidInstallUpdate')}</Button>
          </> : null}
          <Button variant="outline" disabled={busy || state?.phase === 'disabled'} onClick={() => void check()}>
            <RefreshCw className="mr-2 h-4 w-4" />{t('androidCheckUpdates')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
