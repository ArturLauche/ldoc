import { useState, useEffect, useCallback, useMemo } from 'react';
import { History, Clock, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  deleteDocumentVersion,
  getDocumentVersions,
  saveDocumentVersion,
  type StoredVersion,
} from '@/lib/versionHistory';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
import { useConfirm } from '@/components/confirm-provider';

interface VersionHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (content: string) => void;
  currentContent: string;
  documentName: string;
  documentId: string;
}

export const VersionHistory = ({
  isOpen,
  onClose,
  onRestore,
  currentContent,
  documentName,
  documentId,
}: VersionHistoryProps) => {
  const { t, locale } = useLocale();
  const confirm = useConfirm();
  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<StoredVersion | null>(null);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  );
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }),
    [locale],
  );
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  const loadVersions = useCallback(() => {
    setVersions(getDocumentVersions(documentId));
  }, [documentId]);

  useEffect(() => {
    loadVersions();
    setSelectedVersion(null);
  }, [documentId, isOpen, loadVersions]);

  const saveVersion = () => {
    saveDocumentVersion({
      documentId,
      name: documentName,
      content: currentContent,
      kind: 'manual',
    });
    loadVersions();
    toast.success(t('versionSavedToast'));
  };

  const handleRestore = (version: StoredVersion) => {
    saveDocumentVersion({
      documentId,
      name: `${documentName} ${t('versionBeforeRestoreSuffix')}`,
      content: currentContent,
      kind: 'safety',
    });
    onRestore(version.content);
    toast.success(
      formatMessage(t('versionRestoredToast'), {
        date: dateTimeFormat.format(new Date(version.timestamp)),
      }),
    );
    onClose();
  };

  const versionKindLabel = (version: StoredVersion) => {
    if (version.kind === 'auto') return t('versionKindAutomatic');
    if (version.kind === 'safety') return t('versionKindSafety');
    return t('versionKindManual');
  };

  const handleDelete = async (version: StoredVersion) => {
    const confirmed = await confirm({
      title: t('versionDeleteConfirmTitle'),
      description: formatMessage(t('versionDeleteConfirmBody'), {
        date: dateTimeFormat.format(new Date(version.timestamp)),
      }),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!confirmed) return;

    deleteDocumentVersion(version.id);
    loadVersions();
    if (selectedVersion?.id === version.id) {
      setSelectedVersion(null);
    }
    toast.success(t('versionDeletedToast'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div className="bg-background border border-border w-full max-w-4xl h-[80vh] flex flex-col rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t('versionHistoryTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {formatMessage(t('versionHistorySavedCount'), { count: versions.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={saveVersion} size="sm">
              {t('versionHistorySaveCurrent')}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('versionHistoryCloseAria')}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Version List */}
          <div className="w-72 border-r border-border/50 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {versions.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">{t('versionHistoryEmptyTitle')}</p>
                    <p className="text-xs mt-1">{t('versionHistoryEmptyHint')}</p>
                  </div>
                ) : (
                  versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => setSelectedVersion(version)}
                      className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                        selectedVersion?.id === version.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-accent/50 border border-transparent'
                      }`}
                    >
                      <div className="font-medium text-sm truncate">{version.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {versionKindLabel(version)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {dateFormat.format(new Date(version.timestamp))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {timeFormat.format(new Date(version.timestamp))}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col">
            {selectedVersion ? (
              <>
                <div className="p-4 border-b border-border/50 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{selectedVersion.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {versionKindLabel(selectedVersion)} ·{' '}
                      {dateTimeFormat.format(new Date(selectedVersion.timestamp))}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDelete(selectedVersion)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t('delete')}
                    </Button>
                    <Button size="sm" onClick={() => handleRestore(selectedVersion)}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      {t('restore')}
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(selectedVersion.content) }}
                  />
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>{t('versionHistorySelectPrompt')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
