import { useState, useEffect, useCallback, useMemo, type RefObject } from 'react';
import { BookmarkPlus, History, RotateCcw, Trash2 } from 'lucide-react';
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
import { focusContainerOnTouch } from '@/lib/inputModality';
import { formatRecentDate } from '@/lib/relativeTime';

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
  // Relative dates count from the latest read, so a version saved while the
  // panel is open reads "now" rather than minutes in the future.
  const [now, setNow] = useState(() => Date.now());
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
    setNow(Date.now());
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
  // Names repeat the document name or the kind for most versions; show them only when they add something.
  const versionNote = (version: StoredVersion) =>
    version.name === documentName || version.name === t('versionAutomaticLabel') ? null : version.name;

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
        onOpenAutoFocus={focusContainerOnTouch}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
        className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 [--sheet-padding-bottom:0px] max-sm:h-[calc(var(--app-viewport-height,100dvh)-0.75rem)] sm:max-w-5xl"
      >
        <DialogHeader className="border-b px-5 pb-3 pt-5">
          <DialogTitle>{t('versionHistoryTitle')}</DialogTitle>
          <DialogDescription className="truncate">
            {documentName} ·{' '}
            {formatMessage(t('versionHistorySavedCount'), {
              count: versions.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="flex max-h-[34%] shrink-0 flex-col border-b sm:max-h-none sm:w-64 sm:border-b-0 sm:border-e">
            <div className="p-3">
              <Button
                onClick={saveVersion}
                variant="outline"
                className="w-full"
                disabled={readError || loading}
              >
                <BookmarkPlus />
                {t('versionHistorySaveCurrent')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
              {loading ? (
                <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
                  {t('loadingDocument')}
                </p>
              ) : readError ? (
                <p role="alert" className="px-2 py-3 text-sm text-destructive">
                  {t('versionReadFailed')}
                </p>
              ) : versions.length ? (
                <ul className="space-y-0.5">
                  {versions.map((version) => {
                    const note = versionNote(version);
                    return (
                      <li key={version.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedVersion(version)}
                          aria-pressed={selectedVersion?.id === version.id}
                          className="w-full rounded-md px-2.5 py-2 text-start transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring aria-pressed:bg-selected/12 pointer-coarse:py-2.5"
                        >
                          <time
                            dateTime={version.timestamp}
                            className="block text-sm font-medium tabular-nums"
                          >
                            {formatRecentDate(new Date(version.timestamp), locale, now)}
                          </time>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="shrink-0">{versionKindLabel(version)}</span>
                            {note ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{note}</span>
                              </>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  {t('versionHistoryEmptyTitle')}
                </p>
              )}
            </div>
          </aside>
          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
            aria-label={t('versionHistorySelectPrompt')}
          >
            {selectedVersion && !readError ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b bg-card px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {dateTimeFormat.format(new Date(selectedVersion.timestamp))}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {versionKindLabel(selectedVersion)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={restoring}
                      onClick={() => void handleDelete(selectedVersion)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 />
                      {t('delete')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={restoring}
                      onClick={() => void handleRestore(selectedVersion)}
                    >
                      <RotateCcw />
                      {t('restore')}
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6">
                  {/* The editor's own document styles, so the preview shows what a restore brings back. */}
                  <div className="editor-content document-preview mx-auto max-w-3xl rounded-sm border bg-card">
                    <div
                      className="ProseMirror prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: preview }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <History aria-hidden="true" className="mb-3 h-6 w-6 text-muted-foreground" />
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
