import { useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { useLocale } from '@/hooks/useLocale';
import { assertDocumentSize } from '@/lib/documentLimits';
import {
  addImportedDocumentToLibrary,
  createLibraryBackup,
  deleteLibraryDocument,
  duplicateLibraryDocument,
  exportLibraryDocumentsFile,
  getLibraryDocuments,
  importSingleLibraryDocument,
  importUnifiedLibraryFile,
  type StoredDocument,
} from '@/lib/documentLibrary';
import { downloadBlob } from '@/lib/download';
import type { ExportFormat } from '@/lib/export/types';
import { buildExportFileName } from '@/lib/fileNames';
import { openFilePicker } from '@/lib/filePicker';
import { logError } from '@/lib/logger';
import { formatMessage, type TranslationKey } from '@/lib/translations';

export const SUPPORTED_IMPORT_FORMATS = '.txt,.html,.htm,.rtf,.docx,.odt,.ott,.fodt';
const LIBRARY_FILE_TYPES = '.json,.lwrite.json,application/json';

/** Export formats, most requested first. Labels are the menu entries. */
export const EXPORT_FORMATS: { format: ExportFormat; label: TranslationKey }[] = [
  { format: 'pdf', label: 'fileMenuFormatPdf' },
  { format: 'docx', label: 'fileMenuFormatDocx' },
  { format: 'odt', label: 'fileMenuFormatOdt' },
  { format: 'rtf', label: 'fileMenuFormatRtf' },
  { format: 'html', label: 'fileMenuFormatHtml' },
  { format: 'txt', label: 'fileMenuFormatTxt' },
];

export interface FileActionsOptions {
  editor: Editor | null;
  documentId: string;
  documentName: string;
  setDocumentName: (name: string) => void;
  onSaveDocument: () => boolean | Promise<boolean>;
  onLoadDocument: (doc: StoredDocument) => Promise<boolean>;
  onCreateNewDocument: () => Promise<boolean>;
  onImportDocument: (content: string, name: string) => Promise<boolean>;
}

/**
 * Every file, library and export action behind the File menu, so the menu
 * components stay presentational. Converters and storage live in `src/lib`.
 */
export function useFileActions({
  editor,
  documentId,
  documentName,
  setDocumentName,
  onSaveDocument,
  onLoadDocument,
  onCreateNewDocument,
  onImportDocument,
}: FileActionsOptions) {
  const { t, tCount, requestedLocale } = useLocale();
  const confirm = useConfirm();
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryDocuments, setLibraryDocuments] = useState<StoredDocument[]>([]);
  // "Now" for the relative dates: the moment the list was read, not when the
  // (always mounted) dialog first rendered.
  const [libraryListedAt, setLibraryListedAt] = useState(() => Date.now());
  const [renameOpen, setRenameOpen] = useState(false);

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      setLibraryDocuments(await getLibraryDocuments({ strict: true }));
      setLibraryListedAt(Date.now());
      setLibraryError(false);
    } catch {
      setLibraryError(true);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const setLibraryVisible = useCallback(
    (open: boolean) => {
      if (open) void refreshLibrary();
      setLibraryOpen(open);
    },
    [refreshLibrary],
  );

  const newDocument = async () => {
    if (!editor) return;
    if (await onCreateNewDocument()) toast.success(t('newDocumentCreated'));
  };

  const pickFiles = (options: Parameters<typeof openFilePicker>[0]) => {
    if (!openFilePicker(options)) toast.error(t('openFailed'));
  };

  const openFile = () => {
    if (!editor) return;
    pickFiles({
      accept: SUPPORTED_IMPORT_FORMATS,
      onSelect: async ([file]) => {
        setIsImporting(true);
        toast.loading(t('importInProgress'), { id: 'import' });
        try {
          const { importDocument } = await import('./DocumentImporter');
          const result = await importDocument(file);
          if (!(await onImportDocument(result.content, result.fileName))) {
            toast.dismiss('import');
            return;
          }
          void refreshLibrary();
          toast.success(formatMessage(t('openedFileToast'), { name: file.name }), { id: 'import' });
        } catch (error) {
          logError('Import error', error);
          toast.error(t('importFailed'), { id: 'import' });
        } finally {
          setIsImporting(false);
        }
      },
    });
  };

  const save = async () => {
    await onSaveDocument();
    await refreshLibrary();
  };

  const exportLibrary = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { payload, count, includesDraft } = await createLibraryBackup(
        { id: documentId, name: documentName, content: editor?.getHTML() ?? '<p></p>' },
        t('backupDraftSuffix'),
      );
      const fileName = `lwrite-library-${new Date().toISOString().slice(0, 10)}.lwrite.json`;
      downloadBlob(new Blob([payload], { type: 'application/json' }), fileName);
      toast.success(tCount('exportedLibraryToast', count));
      if (includesDraft) toast.info(t('backupIncludesDraft'));
    } catch (error) {
      logError('Library export failed', error);
      toast.error(t('exportLibraryFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const importLibrary = () => {
    pickFiles({
      accept: LIBRARY_FILE_TYPES,
      onSelect: async ([file]) => {
        setIsImporting(true);
        try {
          assertDocumentSize(file);
          const result = await importUnifiedLibraryFile(await file.text());
          void refreshLibrary();
          toast.success(
            formatMessage(t('importedLibraryToast'), {
              imported: result.imported,
              skipped: result.skipped,
            }),
          );
        } catch (error) {
          logError('Library import failed', error);
          toast.error(t('invalidLibraryFile'));
        } finally {
          setIsImporting(false);
        }
      },
    });
  };

  /**
   * Imports one or more files into the library as new documents: LWrite
   * document files (.json) and regular formats (.docx, .odt, .rtf, .html,
   * .txt, ...). The open document is never replaced.
   */
  const importFiles = () => {
    pickFiles({
      accept: `${SUPPORTED_IMPORT_FORMATS},${LIBRARY_FILE_TYPES}`,
      multiple: true,
      onSelect: async (files) => {
        setIsImporting(true);
        toast.loading(t('importInProgress'), { id: 'import-single' });
        let lastName = '';
        let imported = 0;
        let failed = 0;
        for (const file of files) {
          try {
            assertDocumentSize(file);
            const isLibraryFile = /\.json$/i.test(file.name) || file.type === 'application/json';
            if (isLibraryFile) {
              lastName = (await importSingleLibraryDocument(await file.text())).name;
            } else {
              const { importDocument } = await import('./DocumentImporter');
              const result = await importDocument(file);
              lastName = (await addImportedDocumentToLibrary(result.fileName, result.content)).name;
            }
            imported += 1;
          } catch (error) {
            logError('Single document import failed', error);
            failed += 1;
          }
        }
        void refreshLibrary();
        setIsImporting(false);
        toast.dismiss('import-single');
        if (imported > 0) {
          toast.success(
            imported === 1
              ? `${t('importedSingleDocToast')}: ${lastName}`
              : `${t('importedSingleDocToast')} (${imported})`,
          );
        }
        if (failed > 0) toast.error(t('importFailed'));
      },
    });
  };

  const exportLibraryDocument = (doc: StoredDocument) => {
    try {
      const payload = exportLibraryDocumentsFile([doc]);
      downloadBlob(
        new Blob([payload], { type: 'application/json' }),
        buildExportFileName(doc.name, 'lwrite.json'),
      );
      toast.success(formatMessage(t('exportedDocumentToast'), { name: doc.name }));
    } catch (error) {
      logError('Document export failed', error);
      toast.error(t('exportDocumentFailed'));
    }
  };

  const duplicateDocument = async (doc: StoredDocument) => {
    try {
      const duplicated = await duplicateLibraryDocument(doc.id);
      void refreshLibrary();
      toast.success(formatMessage(t('documentDuplicatedToast'), { name: duplicated.name }));
    } catch (error) {
      logError('Document duplicate failed', error);
      toast.error(t('duplicateDocumentFailed'));
    }
  };

  const deleteDocument = async (doc: StoredDocument) => {
    const confirmed = await confirm({
      title: t('confirmDeleteDocumentTitle'),
      description: formatMessage(t('confirmDeleteDocumentBody'), { name: doc.name }),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      if (doc.id === documentId && !(await onCreateNewDocument())) return;
      await deleteLibraryDocument(doc.id);
      void refreshLibrary();
      toast.success(formatMessage(t('documentDeletedToast'), { name: doc.name }));
    } catch (error) {
      logError('Document delete failed', error);
      toast.error(t('deleteDocumentFailed'));
    }
  };

  const openLibraryDocument = async (doc: StoredDocument) => {
    if (!(await onLoadDocument(doc))) return;
    setLibraryOpen(false);
    toast.success(formatMessage(t('openedDocumentToast'), { name: doc.name }));
  };

  const exportAs = async (format: ExportFormat) => {
    if (!editor || isExporting) return;
    setIsExporting(true);
    try {
      const { exportDocument } = await import('@/lib/export/documentExport');
      const { blob, fileName, warnings } = await exportDocument({
        html: editor.getHTML(),
        name: documentName,
        // Paper size and document language follow the chosen language, also
        // while its interface messages could not load.
        locale: requestedLocale,
        format,
      });
      downloadBlob(blob, fileName);
      toast.success(`${t('exportSuccess')} ${fileName}`);
      if (warnings.length) {
        toast.warning(
          warnings.length === 1
            ? formatMessage(t('exportWarningSingle'), { message: warnings[0].message })
            : formatMessage(t('exportWarningMany'), {
                count: warnings.length,
                message: warnings[0].message,
              }),
        );
      }
    } catch (error) {
      logError('Export failed', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(formatMessage(t('exportFailedToast'), { message }));
    } finally {
      setIsExporting(false);
    }
  };

  const rename = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    setDocumentName(trimmed);
    setRenameOpen(false);
    toast.success(t('documentRenamed'));
    return true;
  };

  const print = () => requestAnimationFrame(() => window.print());

  return {
    isImporting,
    isExporting,
    library: {
      open: libraryOpen,
      setOpen: setLibraryVisible,
      documents: libraryDocuments,
      listedAt: libraryListedAt,
      loading: libraryLoading,
      error: libraryError,
    },
    renameDialog: { open: renameOpen, setOpen: setRenameOpen },
    newDocument,
    openFile,
    save,
    rename,
    print,
    exportAs,
    exportLibrary,
    importLibrary,
    importFiles,
    exportLibraryDocument,
    duplicateDocument,
    deleteDocument,
    openLibraryDocument,
  };
}

export type FileActions = ReturnType<typeof useFileActions>;
