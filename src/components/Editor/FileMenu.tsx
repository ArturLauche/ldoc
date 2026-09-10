import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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
import { assertDocumentSize } from '@/lib/documentLimits';
import { toast } from 'sonner';
import { downloadBlob } from '@/lib/download';
import { buildExportFileName as buildSafeExportFileName } from '@/lib/fileNames';
import type { ExportFormat } from '@/lib/export/types';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { useConfirm } from '@/hooks/useConfirm';
import { logError } from '@/lib/logger';
import {
  addImportedDocumentToLibrary,
  deleteLibraryDocument,
  duplicateLibraryDocument,
  exportLibraryDocumentsFile,
  getLibraryDocuments,
  importSingleLibraryDocument,
  importUnifiedLibraryFile,
  type StoredDocument,
} from '@/lib/documentLibrary';

const SUPPORTED_IMPORT_FORMATS = '.txt,.html,.htm,.rtf,.docx,.odt,.ott,.fodt';

interface FileMenuProps {
  menuTriggerRef?: RefObject<HTMLButtonElement>;
  editor: Editor | null;
  documentId: string;
  documentName: string;
  setDocumentName: (name: string) => void;
  onSaveDocument: () => boolean;
  onLoadDocument: (doc: StoredDocument) => Promise<boolean>;
  onCreateNewDocument: () => Promise<boolean>;
  onImportDocument: (content: string, name: string) => Promise<boolean>;
  onShowVersionHistory: () => void;
}

export const FileMenu = ({
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [libraryDocuments, setLibraryDocuments] = useState<StoredDocument[]>([]);

  const refreshLibraryDocuments = useCallback(() => {
    try {
      setLibraryDocuments(getLibraryDocuments({ strict: true }));
      setLibraryError(false);
    } catch {
      setLibraryError(true);
    }
  }, []);

  useEffect(() => {
    if (!libraryOpen) return;
    refreshLibraryDocuments();
  }, [refreshKey, libraryOpen, refreshLibraryDocuments]);

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
          setRefreshKey((value) => value + 1);
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

  const handleSave = () => {
    onSaveDocument();
    setRefreshKey((value) => value + 1);
  };

  const handleExportLibrary = () => {
    try {
      if (!onSaveDocument()) return;
      const documents = getLibraryDocuments({ strict: true });
      const payload = exportLibraryDocumentsFile(documents);
      const fileName = `lwrite-library-${new Date().toISOString().slice(0, 10)}.lwrite.json`;
      const blob = new Blob([payload], { type: 'application/json' });
      downloadBlob(blob, fileName);
      toast.success(formatMessage(t('exportedLibraryToast'), { count: documents.length }));
    } catch (error) {
      logError('Library export failed', error);
      toast.error(t('exportLibraryFailed'));
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
        const result = importUnifiedLibraryFile(raw);
        setRefreshKey((value) => value + 1);
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
            const doc = importSingleLibraryDocument(await file.text());
            lastName = doc.name;
          } else {
            const { importDocument } = await import('./DocumentImporter');
            const result = await importDocument(file);
            const doc = addImportedDocumentToLibrary(result.fileName, result.content);
            lastName = doc.name;
          }
          imported += 1;
        } catch (error) {
          logError('Single document import failed', error);
          failed += 1;
        }
      }

      setRefreshKey((value) => value + 1);
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

  const handleDuplicateLibraryDocument = (doc: StoredDocument) => {
    try {
      const duplicated = duplicateLibraryDocument(doc.id);
      setRefreshKey((value) => value + 1);
      toast.success(formatMessage(t('documentDuplicatedToast'), { name: duplicated.name }));
    } catch (error) {
      logError('Document duplicate failed', error);
      toast.error(t('duplicateDocumentFailed'));
    }
  };

  const handleDeleteLibraryDocument = async (doc: StoredDocument) => {
    const confirmed = await confirm({
      title: t('confirmDeleteDocumentTitle'),
      description: formatMessage(t('confirmDeleteDocumentBody'), { name: doc.name }),
      confirmLabel: t('delete'),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      if (doc.id === documentId && !(await onCreateNewDocument())) return;
      deleteLibraryDocument(doc.id);
      setRefreshKey((value) => value + 1);
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
            ? formatMessage(t('exportWarningSingle'), { message: warnings[0].message })
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

  const handleRename = () => {
    if (newName.trim()) {
      setDocumentName(newName.trim());
      setRenameOpen(false);
      toast.success(t('documentRenamed'));
    }
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
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
          <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
            <Search className="h-4 w-4 mr-2" />
            {t('searchDocuments')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Files className="h-4 w-4 mr-2" />
              {t('libraryTransfer')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-popover border border-border shadow-lg z-50 min-w-[180px]">
              <DropdownMenuItem onClick={handleExportLibrary}>
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
              <DropdownMenuItem onClick={() => void exportAs('txt')} disabled={isExporting}>
                <FileType className="h-4 w-4 mr-2" />
                {t('fileMenuFormatTxt')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('html')} disabled={isExporting}>
                <FileText className="h-4 w-4 mr-2" />
                {t('fileMenuFormatHtml')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('rtf')} disabled={isExporting}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {t('fileMenuFormatRtf')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('docx')} disabled={isExporting}>
                <FileBadge2 className="h-4 w-4 mr-2" />
                {t('fileMenuFormatDocx')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('odt')} disabled={isExporting}>
                <FileArchive className="h-4 w-4 mr-2" />
                {t('fileMenuFormatOdt')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void exportAs('pdf')} disabled={isExporting}>
                <FileOutput className="h-4 w-4 mr-2" />
                {t('fileMenuFormatPdf')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setNewName(documentName);
              setRenameOpen(true);
            }}
          >
            {t('fileMenuRename')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestAnimationFrame(() => window.print())}>
            <Printer className="h-4 w-4 mr-2" />
            {t('fileMenuPrint')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShowVersionHistory}>
            <History className="h-4 w-4 mr-2" />
            {t('fileMenuVersionHistory')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
        onOpenChange={setLibraryOpen}
        documents={libraryDocuments}
        currentId={documentId}
        error={libraryError}
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
