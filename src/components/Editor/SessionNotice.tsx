import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/useLocale';

interface SessionNoticeProps {
  hasExternalChanges: boolean;
  saveError: 'save' | 'load' | null;
  busy: boolean;
  onSaveCopy: () => void;
  onReloadSaved: () => void;
  onRetrySave: () => void;
}

/** One actionable banner for conflicts with another tab or failed local storage. */
export function SessionNotice({
  hasExternalChanges,
  saveError,
  busy,
  onSaveCopy,
  onReloadSaved,
  onRetrySave,
}: SessionNoticeProps) {
  const { t } = useLocale();
  if (!hasExternalChanges && !saveError) return null;
  const message = hasExternalChanges
    ? t('externalChanges')
    : t(saveError === 'load' ? 'loadFailed' : 'saveFailed');

  return (
    <div role="alert" className="session-notice" data-editor-chrome>
      <div className="session-notice-inner">
        {/* A real basis: on phones the buttons wrap below instead of squeezing the
            text, and the icon stays beside the text it belongs to. */}
        <div className="flex min-w-0 flex-[1_1_17.75rem] items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <p className="min-w-0 flex-1">{message}</p>
        </div>
        {hasExternalChanges ? (
          <div className="ms-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onReloadSaved}>
              {t('reloadSaved')}
            </Button>
            <Button size="sm" disabled={busy} onClick={onSaveCopy}>
              {t('saveAsCopy')}
            </Button>
          </div>
        ) : saveError === 'save' ? (
          <Button size="sm" className="ms-auto" onClick={onRetrySave}>
            {t('retrySave')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
