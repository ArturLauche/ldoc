import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Editor } from '@tiptap/react';
import {
  FileText,
  Folder,
  FolderOpen,
  Save,
  Download,
  FilePlus,
  History,
  ChevronDown,
  FileType,
  FileSpreadsheet,
  FileOutput,
  FileBadge2,
  FileArchive,
  Search,
  Files,
  Upload,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DocumentLibraryDialog } from './DocumentLibraryDialog';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import { focusContainerOnTouch } from '@/lib/inputModality';
import { assertDocumentSize } from '@/lib/documentLimits';
import { toast } from 'sonner';
import { downloadBlob } from '@/lib/download';
import { buildExportFileName as buildSafeExportFileName } from '@/lib/fileNames';
import type { ExportFormat } from '@/lib/export/types';
import { formatMessage, type TranslationKey } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { useConfirm } from '@/hooks/useConfirm';
import { logError } from '@/lib/logger';
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

const SUPPORTED_IMPORT_FORMATS = '.txt,.html,.htm,.rtf,.docx,.odt,.ott,.fodt';

const EXPORT_FORMATS: {
  format: ExportFormat;
  label: TranslationKey;
  icon: typeof FileText;
}[] = [
  { format: 'txt', label: 'fileMenuFormatTxt', icon: FileType },
  { format: 'html', label: 'fileMenuFormatHtml', icon: FileText },
  { format: 'rtf', label: 'fileMenuFormatRtf', icon: FileSpreadsheet },
  { format: 'docx', label: 'fileMenuFormatDocx', icon: FileBadge2 },
  { format: 'odt', label: 'fileMenuFormatOdt', icon: FileArchive },
  { format: 'pdf', label: 'fileMenuFormatPdf', icon: FileOutput },
];

function SheetSection({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="file-sheet-section">
      {label ? <h3 className="file-sheet-label">{label}</h3> : null}
      {children}
    </section>
  );
}

function SheetAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="file-sheet-action" onClick={onClick} disabled={disabled}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

interface FileMenuProps {
  /** Phones open the file actions as a bottom sheet instead of nested menus. */
  compact?: boolean;
  menuTriggerRef?: RefObject<HTMLButtonElement | null>;
  editor: Editor | null;
  documentId: string;
  documentName: string;
  setDocumentName: (name: string) => void;
  onSaveDocument: () => boolean | Promise<boolean>;
  onLoadDocument: (doc: StoredDocument) => Promise<boolean>;
  onCreateNewDocument: () => Promise<boolean>;
  onImportDocument: (content: string, name: string) => Promise<boolean>;
  onShowVersionHistory: () => void;
}

export const FileMenu = ({
  compact = false,
  menuTriggerRef,
  editor,
  documentId,
  documentName,
  setDocumentName,
  onSaveDocument,
  onLoadDocument,
  onCreateNewDocument,
  onShowVersionHistory,
  onImportDocument,
}: FileMenuProps) => {
  const fallbackTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = menuTriggerRef ?? fallbackTriggerRef;
  const { t, locale } = useLocale();
  const confirm = useConfirm();
  const [renameOpen, setRenameOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [newName, setNewName] = useState(documentName);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryDocuments, setLibraryDocuments] = useState<StoredDocument[]>([]);
  const fileMenu = useTouchSafeMenu();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Dialogs opened from the sheet wait until it has closed and released focus.
  const afterSheetCloseRef = useRef<(() => void) | null>(null);

  const refreshLibraryDocuments = useCallback(async () => {
    setLibraryLoading(true);
    try {
      setLibraryDocuments(await getLibraryDocuments({ strict: true }));
      setLibraryError(false);
    } catch {
      setLibraryError(true);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  const handleLibraryOpenChange = (open: boolean) => {
    if (open) refreshLibraryDocuments();
    setLibraryOpen(open);
  };

  const handleNewDocument = async () => {
    if (!editor) return;

    if (await onCreateNewDocument()) toast.success(t('newDocumentCreated'));
  };

  const handleOpenFile = async () => {
    if (!editor) return;

    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = SUPPORTED_IMPORT_FORMATS;

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        setIsImporting(true);
        toast.loading(t('importInProgress'), { id: 'import' });

        try {
          const { importDocument } = await import('./DocumentImporter');
          const result = await importDocument(file);
          if (!(await onImportDocument(result.content, result.fileName))) {
            toast.dismiss('import');
            return;
          }
          refreshLibraryDocuments();
          toast.success(formatMessage(t('openedFileToast'), { name: file.name }), { id: 'import' });
        } catch (error) {
          logError('Import error', error);
          toast.error(t('importFailed'), { id: 'import' });
        } finally {
          setIsImporting(false);
        }
      };

      input.click();
    } catch (error) {
      logError('Open failed', error);
      toast.error(t('openFailed'));
    }
  };

  const handleSave = async () => {
    await onSaveDocument();
    await refreshLibraryDocuments();
  };

  const handleExportLibrary = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const { payload, count, includesDraft } = await createLibraryBackup(
        {
          id: documentId,
          name: documentName,
          content: editor?.getHTML() ?? '<p></p>',
        },
        t('backupDraftSuffix'),
      );
      const fileName = `lwrite-library-${new Date().toISOString().slice(0, 10)}.lwrite.json`;
      const blob = new Blob([payload], { type: 'application/json' });
      downloadBlob(blob, fileName);
      toast.success(formatMessage(t('exportedLibraryToast'), { count }));
      if (includesDraft) toast.info(t('backupIncludesDraft'));
    } catch (error) {
      logError('Library export failed', error);
      toast.error(t('exportLibraryFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportLibrary = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.lwrite.json,application/json';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsImporting(true);
      try {
        assertDocumentSize(file);
        const raw = await file.text();
        const result = await importUnifiedLibraryFile(raw);
        refreshLibraryDocuments();
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
    };
    input.click();
  };

  /**
   * Imports one or more individual files into the library as new documents.
   * Accepts both LWrite document files (.json) and regular document formats
   * (.docx, .odt, .rtf, .html, .txt, ...). The open document is never replaced.
   */
  const handleImportSingleDocument = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = `${SUPPORTED_IMPORT_FORMATS},.json,.lwrite.json,application/json`;
    input.onchange = async (event) => {
      const files = Array.from((event.target as HTMLInputElement).files ?? []);
      if (files.length === 0) return;

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
            const doc = await importSingleLibraryDocument(await file.text());
            lastName = doc.name;
          } else {
            const { importDocument } = await import('./DocumentImporter');
            const result = await importDocument(file);
            const doc = await addImportedDocumentToLibrary(result.fileName, result.content);
            lastName = doc.name;
          }
          imported += 1;
        } catch (error) {
          logError('Single document import failed', error);
          failed += 1;
        }
      }

      refreshLibraryDocuments();
      setIsImporting(false);
      toast.dismiss('import-single');

      if (imported > 0) {
        toast.success(
          imported === 1
            ? `${t('importedSingleDocToast')}: ${lastName}`
            : `${t('importedSingleDocToast')} (${imported})`,
        );
      }
      if (failed > 0) {
        toast.error(t('importFailed'));
      }
    };
    input.click();
  };

  const handleExportLibraryDocument = (doc: StoredDocument) => {
    try {
      const payload = exportLibraryDocumentsFile([doc]);
      const fileName = buildSafeExportFileName(doc.name, 'lwrite.json');
      const blob = new Blob([payload], { type: 'application/json' });
      downloadBlob(blob, fileName);
      toast.success(formatMessage(t('exportedDocumentToast'), { name: doc.name }));
    } catch (error) {
      logError('Document export failed', error);
      toast.error(t('exportDocumentFailed'));
    }
  };

  const handleDuplicateLibraryDocument = async (doc: StoredDocument) => {
    try {
      const duplicated = await duplicateLibraryDocument(doc.id);
      refreshLibraryDocuments();
      toast.success(formatMessage(t('documentDuplicatedToast'), { name: duplicated.name }));
    } catch (error) {
      logError('Document duplicate failed', error);
      toast.error(t('duplicateDocumentFailed'));
    }
  };

  const handleDeleteLibraryDocument = async (doc: StoredDocument) => {
    const confirmed = await confirm({
      title: t('confirmDeleteDocumentTitle'),
      description: formatMessage(t('confirmDeleteDocumentBody'), {
        name: doc.name,
      }),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      if (doc.id === documentId && !(await onCreateNewDocument())) return;
      await deleteLibraryDocument(doc.id);
      refreshLibraryDocuments();
      toast.success(formatMessage(t('documentDeletedToast'), { name: doc.name }));
    } catch (error) {
      logError('Document delete failed', error);
      toast.error(t('deleteDocumentFailed'));
    }
  };

  const handleOpenLibraryDocument = async (doc: StoredDocument) => {
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
        locale,
        format,
      });
      downloadBlob(blob, fileName);
      toast.success(`${t('exportSuccess')} ${fileName}`);
      if (warnings.length) {
        const summary =
          warnings.length === 1
            ? formatMessage(t('exportWarningSingle'), {
                message: warnings[0].message,
              })
            : formatMessage(t('exportWarningMany'), {
                count: warnings.length,
                message: warnings[0].message,
              });
        toast.warning(summary);
      }
    } catch (error) {
      logError('Export failed', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(formatMessage(t('exportFailedToast'), { message }));
    } finally {
      setIsExporting(false);
    }
  };

  const startRename = () => {
    setNewName(documentName);
    setRenameOpen(true);
  };

  const print = () => requestAnimationFrame(() => window.print());

  /** File pickers and downloads run within the tap; dialogs open after the sheet closes. */
  const runFromSheet = (action: () => void, timing: 'now' | 'after-close' = 'now') => {
    if (timing === 'after-close') afterSheetCloseRef.current = action;
    setSheetOpen(false);
    if (timing === 'now') action();
  };

  const handleRename = () => {
    if (newName.trim()) {
      setDocumentName(newName.trim());
      setRenameOpen(false);
      toast.success(t('documentRenamed'));
    }
  };

  const trigger = compact ? (
    <Button
      ref={triggerRef}
      variant="ghost"
      className="h-10 shrink-0 gap-0.5 px-2"
      aria-label={t('fileMenuLabel')}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      onClick={() => setSheetOpen(true)}
    >
      <Folder className="h-5 w-5" />
      <ChevronDown className="h-3 w-3 opacity-70" />
    </Button>
  ) : null;

  return (
    <>
      {compact ? (
        <>
          {trigger}
          <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
            <DialogContent
              className="file-sheet flex flex-col gap-0 overflow-hidden p-0 [--sheet-padding-bottom:0.5rem] sm:max-w-sm"
              onOpenAutoFocus={focusContainerOnTouch}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const action = afterSheetCloseRef.current;
                afterSheetCloseRef.current = null;
                if (action) action();
                else triggerRef.current?.focus();
              }}
            >
              <DialogHeader className="border-b border-border px-5 pb-3 pt-5 pr-14 text-left">
                <DialogTitle>{t('fileMenuLabel')}</DialogTitle>
                <DialogDescription className="truncate">
                  {documentName || t('untitledDocument')}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                <SheetSection>
                  <SheetAction
                    icon={<FilePlus />}
                    label={t('fileMenuNewDocument')}
                    onClick={() => runFromSheet(() => void handleNewDocument(), 'after-close')}
                  />
                  <SheetAction
                    icon={<FolderOpen />}
                    label={isImporting ? t('importInProgress') : t('fileMenuOpen')}
                    disabled={isImporting}
                    onClick={() => runFromSheet(() => void handleOpenFile())}
                  />
                  <SheetAction
                    icon={<Save />}
                    label={t('fileMenuSave')}
                    onClick={() => runFromSheet(() => void handleSave())}
                  />
                  <SheetAction
                    icon={<FileText />}
                    label={t('fileMenuRename')}
                    onClick={() => runFromSheet(startRename, 'after-close')}
                  />
                  <SheetAction
                    icon={<History />}
                    label={t('fileMenuVersionHistory')}
                    onClick={() => runFromSheet(onShowVersionHistory, 'after-close')}
                  />
                  <SheetAction
                    icon={<Printer />}
                    label={t('fileMenuPrint')}
                    onClick={() => runFromSheet(print, 'after-close')}
                  />
                </SheetSection>
                <SheetSection label={t('documentLibrary')}>
                  <SheetAction
                    icon={<Search />}
                    label={t('searchDocuments')}
                    onClick={() => runFromSheet(() => handleLibraryOpenChange(true), 'after-close')}
                  />
                  <SheetAction
                    icon={<Upload />}
                    label={t('importSingleDoc')}
                    disabled={isImporting}
                    onClick={() => runFromSheet(handleImportSingleDocument)}
                  />
                  <SheetAction
                    icon={<Download />}
                    label={t('exportAllDocs')}
                    disabled={isExporting}
                    onClick={() => runFromSheet(() => void handleExportLibrary())}
                  />
                  <SheetAction
                    icon={<Files />}
                    label={t('importAllDocs')}
                    disabled={isImporting}
                    onClick={() => runFromSheet(handleImportLibrary)}
                  />
                </SheetSection>
                <SheetSection label={t('fileMenuExportAs')}>
                  <div className="file-sheet-formats">
                    {EXPORT_FORMATS.map(({ format, label, icon: Icon }) => (
                      <button
                        key={format}
                        type="button"
                        className="file-sheet-format"
                        aria-label={t(label)}
                        disabled={isExporting}
                        onClick={() => runFromSheet(() => void exportAs(format))}
                      >
                        <Icon aria-hidden="true" />
                        <span aria-hidden="true">.{format}</span>
                      </button>
                    ))}
                  </div>
                </SheetSection>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <DropdownMenu modal={false} open={fileMenu.open} onOpenChange={fileMenu.onOpenChange}>
          <DropdownMenuTrigger asChild {...fileMenu.triggerProps}>
            <Button
              ref={triggerRef}
              variant="ghost"
              className="h-9 px-2.5 gap-1.5 text-sm font-medium"
            >
              <Folder className="h-4 w-4" />
              {t('fileMenuLabel')}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            aria-label={t('fileMenuLabel')}
            className="w-56 bg-popover border border-border shadow-lg z-50"
            align="start"
          >
            <DropdownMenuItem onClick={() => void handleNewDocument()}>
              <FilePlus className="h-4 w-4 mr-2" />
              {t('fileMenuNewDocument')}
              <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleOpenFile()} disabled={isImporting}>
              <FolderOpen className="h-4 w-4 mr-2" />
              {isImporting ? t('importInProgress') : t('fileMenuOpen')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSave}>
              <Save className="h-4 w-4 mr-2" />
              {t('fileMenuSave')}
              <span className="ml-auto text-xs text-muted-foreground">⌘S</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleLibraryOpenChange(true)}>
              <Search className="h-4 w-4 mr-2" />
              {t('searchDocuments')}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Files className="h-4 w-4 mr-2" />
                {t('libraryTransfer')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover border border-border shadow-lg z-50 min-w-[180px]">
                <DropdownMenuItem onClick={handleExportLibrary} disabled={isExporting}>
                  <Download className="h-4 w-4 mr-2" />
                  {t('exportAllDocs')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleImportLibrary} disabled={isImporting}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('importAllDocs')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleImportSingleDocument} disabled={isImporting}>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('importSingleDoc')}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download className="h-4 w-4 mr-2" />
                {t('fileMenuExportAs')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover border border-border shadow-lg z-50 min-w-[180px]">
                {EXPORT_FORMATS.map(({ format, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={format}
                    onClick={() => void exportAs(format)}
                    disabled={isExporting}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {t(label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={startRename}>{t('fileMenuRename')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={print}>
              <Printer className="h-4 w-4 mr-2" />
              {t('fileMenuPrint')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onShowVersionHistory}>
              <History className="h-4 w-4 mr-2" />
              {t('fileMenuVersionHistory')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
          className="bg-background border border-border shadow-lg sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{t('renameDocument')}</DialogTitle>
            <DialogDescription>{t('renameDocumentDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{t('renameDocumentNameLabel')}</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentLibraryDialog
        returnFocusRef={triggerRef}
        open={libraryOpen}
        onOpenChange={handleLibraryOpenChange}
        documents={libraryDocuments}
        currentId={documentId}
        error={libraryError}
        loading={libraryLoading}
        importing={isImporting}
        onImport={handleImportSingleDocument}
        onOpen={(doc) => void handleOpenLibraryDocument(doc)}
        onExport={handleExportLibraryDocument}
        onDuplicate={handleDuplicateLibraryDocument}
        onDelete={(doc) => void handleDeleteLibraryDocument(doc)}
      />
    </>
  );
};
