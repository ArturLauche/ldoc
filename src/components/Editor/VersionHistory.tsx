import { useState, useEffect, useCallback, useMemo, type RefObject } from 'react';
import { History, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  deleteDocumentVersion,
  getDocumentVersions,
  migrateLegacyVersionsToDocument,
  saveDocumentVersion,
  type StoredVersion,
} from '@/lib/versionHistory';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { useConfirm } from '@/hooks/useConfirm';

async function readVersions(documentId: string) {
  try {
    return {
      versions: await getDocumentVersions(documentId, { strict: true }),
      readError: false,
    };
  } catch {
    return { versions: [] as StoredVersion[], readError: true };
  }
}

interface VersionHistoryProps {
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (content: string) => Promise<boolean>;
  currentContent: string;
  documentName: string;
  documentId: string;
}

export const VersionHistory = ({
  returnFocusRef,
  isOpen,
  onClose,
  onRestore,
  currentContent,
  documentName,
  documentId,
}: VersionHistoryProps) => {
  const { t, locale } = useLocale();
  const confirm = useConfirm();
  const [{ versions, readError }, setHistory] = useState<{
    versions: StoredVersion[];
    readError: boolean;
  }>({ versions: [], readError: false });
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<StoredVersion | null>(versions[0] ?? null);
  const [restoring, setRestoring] = useState(false);
  const dateTimeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const preview = useMemo(
    () => sanitizeDocumentHtml(selectedVersion?.content ?? ''),
    [selectedVersion?.content],
  );

  const applyHistory = useCallback((next: { versions: StoredVersion[]; readError: boolean }) => {
    setHistory(next);
    setLoading(false);
    setSelectedVersion(
      (selected) =>
        next.versions.find((item) => item.id === selected?.id) ?? next.versions[0] ?? null,
    );
  }, []);
  const loadVersions = useCallback(async () => {
    applyHistory(await readVersions(documentId));
  }, [applyHistory, documentId]);

  useEffect(() => {
    let cancelled = false;
    // Also supports legacy history when there was no current document at startup.
    void migrateLegacyVersionsToDocument(documentId)
      .then(() => readVersions(documentId))
      .then(
        (next) => {
          if (!cancelled) applyHistory(next);
        },
        () => {
          if (!cancelled) applyHistory({ versions: [], readError: true });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [applyHistory, documentId]);

  const saveVersion = async () => {
    try {
      await saveDocumentVersion({
        documentId,
        name: documentName,
        content: currentContent,
        kind: 'manual',
      });
      await loadVersions();
      toast.success(t('versionSavedToast'));
    } catch {
      toast.error(t('versionActionFailed'));
    }
  };

  const handleRestore = async (version: StoredVersion) => {
    setRestoring(true);
    try {
      if (!(await onRestore(version.content))) return;
      toast.success(
        formatMessage(t('versionRestoredToast'), {
          date: dateTimeFormat.format(new Date(version.timestamp)),
        }),
      );
      onClose();
    } finally {
      setRestoring(false);
    }
  };

  const versionKindLabel = (version: StoredVersion) =>
    t(
      version.kind === 'auto'
        ? 'versionKindAutomatic'
        : version.kind === 'safety'
          ? 'versionKindSafety'
          : 'versionKindManual',
    );

  const handleDelete = async (version: StoredVersion) => {
    if (
      !(await confirm({
        title: t('versionDeleteConfirmTitle'),
        description: formatMessage(t('versionDeleteConfirmBody'), {
          date: dateTimeFormat.format(new Date(version.timestamp)),
        }),
        confirmLabel: t('delete'),
        destructive: true,
      }))
    )
      return;
    try {
      await deleteDocumentVersion(version.id);
      await loadVersions();
      toast.success(t('versionDeletedToast'));
    } catch {
      toast.error(t('versionActionFailed'));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
        className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-14 text-left">
          <DialogTitle>{t('versionHistoryTitle')}</DialogTitle>
          <DialogDescription>
            {documentName} ·{' '}
            {formatMessage(t('versionHistorySavedCount'), {
              count: versions.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="flex max-h-[32%] shrink-0 flex-col border-b border-border sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r">
            <div className="p-3">
              <Button
                onClick={saveVersion}
                size="sm"
                variant="outline"
                className="w-full"
                disabled={readError || loading}
              >
                {t('versionHistorySaveCurrent')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {loading ? (
                <p role="status" className="p-3 text-sm text-muted-foreground">
                  {t('loadingDocument')}
                </p>
              ) : readError ? (
                <p role="alert" className="p-3 text-sm text-destructive">
                  {t('versionReadFailed')}
                </p>
              ) : versions.length ? (
                <ul>
                  {versions.map((version) => (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedVersion(version)}
                        aria-pressed={selectedVersion?.id === version.id}
                        className="w-full rounded-sm px-3 py-2.5 text-left hover:bg-accent aria-pressed:bg-accent"
                      >
                        <span className="block truncate text-sm font-medium">{version.name}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {versionKindLabel(version)}
                        </span>
                        <time
                          dateTime={version.timestamp}
                          className="block text-xs text-muted-foreground"
                        >
                          {dateTimeFormat.format(new Date(version.timestamp))}
                        </time>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {t('versionHistoryEmptyTitle')}
                </p>
              )}
            </div>
          </aside>
          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            aria-label={t('versionHistorySelectPrompt')}
          >
            {selectedVersion && !readError ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {versionKindLabel(selectedVersion)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={restoring}
                      onClick={() => void handleDelete(selectedVersion)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      {t('delete')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={restoring}
                      onClick={() => void handleRestore(selectedVersion)}
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      {t('restore')}
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-card p-5 sm:p-8">
                  <div
                    className="document-preview prose prose-sm dark:prose-invert max-w-none break-words text-foreground"
                    dangerouslySetInnerHTML={{ __html: preview }}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <History aria-hidden="true" className="mb-4 h-7 w-7 text-muted-foreground" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  {t(versions.length ? 'versionHistorySelectPrompt' : 'versionHistoryEmptyHint')}
                </p>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
