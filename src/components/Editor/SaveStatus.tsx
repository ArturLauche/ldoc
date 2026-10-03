import { AlertCircle, Check, Circle, HardDrive } from 'lucide-react';
import { useLocale } from '@/hooks/useLocale';
import { cn } from '@/lib/utils';

interface SaveStatusProps {
  saveError: boolean;
  hasExternalChanges: boolean;
  hasUnsavedChanges: boolean;
  lastSaved: Date | null;
}

/**
 * Local save state. The label is visible on wide headers; phones show the
 * icon only (the label stays available to assistive technology).
 */
export function SaveStatus({
  saveError,
  hasExternalChanges,
  hasUnsavedChanges,
  lastSaved,
}: SaveStatusProps) {
  const { t } = useLocale();
  const problem = saveError || hasExternalChanges;
  const label =
    problem || hasUnsavedChanges
      ? t('unsavedChanges')
      : lastSaved
        ? t('savedLocally')
        : t('localOnly');

  return (
    <div
      role="status"
      title={label}
      className={cn(
        'flex shrink-0 items-center gap-1.5 px-1 text-xs text-muted-foreground md:pr-2',
        problem && 'text-destructive',
      )}
    >
      {problem ? (
        <AlertCircle aria-hidden="true" className="h-3.5 w-3.5" />
      ) : hasUnsavedChanges ? (
        <Circle aria-hidden="true" className="h-2 w-2 fill-current" />
      ) : lastSaved ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <HardDrive aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      <span className="sr-only md:not-sr-only md:whitespace-nowrap">{label}</span>
    </div>
  );
}
