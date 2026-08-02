import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Copy,
  Trash2,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { downloadBlob } from '@/lib/download';
import { buildExportFileName as buildSafeExportFileName } from '@/lib/fileNames';
import type { ExportFormat } from '@/lib/export/types';
import { formatMessage } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
import { useConfirm } from '@/components/confirm-provider';
import {
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
  editor: Editor | null;
  documentId: string;
  documentName: string;
  setDocumentName: (name: string) => void;
  onSaveDocument: () => void;
  onLoadDocument: (doc: StoredDocument) => void;
  onCreateNewDocument: () => void;
  onShowVersionHistory: () => void;
  hasUnsavedChanges: boolean;
}

export const FileMenu = ({
  editor,
  documentId,
  documentName,
  setDocumentName,
  onSaveDocument,
  onLoadDocument,
  onCreateNewDocument,
  onShowVersionHistory,
  hasUnsavedChanges,
}: FileMenuProps) => {
  const { t, locale } = useLocale();
  const confirm = useConfirm();
  const [renameOpen, setRenameOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [newName, setNewName] = useState(documentName);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [libraryDocuments, setLibraryDocuments] = useState<StoredDocument[]>([]);

  const refreshLibraryDocuments = useCallback(() => {
    setLibraryDocuments(getLibraryDocuments());
  }, []);

  useEffect(() => {
    if (!libraryOpen) return;
    refreshLibraryDocuments();
  }, [refreshKey, libraryOpen, refreshLibraryDocuments]);

  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return libraryDocuments;
    return libraryDocuments.filter(
      (doc) =>
        doc.name.toLowerCase().includes(query) || doc.content.toLowerCase().includes(query),
    );
  }, [libraryDocuments, searchQuery]);

  const confirmDiscardUnsavedChanges = useCallback(
    () =>
      confirm({
        title: t('unsavedConfirmTitle'),
        description: t('discardUnsavedChanges'),
        destructive: true,
      }),
    [confirm, t],
  );

  const handleNewDocument = async () => {
    if (!editor) return;

    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: t('unsavedConfirmTitle'),
        description: t('unsavedConfirm'),
      });
      if (!confirmed) return;
    }

    onCreateNewDocument();
    toast.success(t('newDocumentCreated'));
  };

  const handleOpenFile = async () => {
    if (!editor) return;
    if (hasUnsavedChanges && !(await confirmDiscardUnsavedChanges())) {
      return;
    }

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
          onCreateNewDocument();
          editor.commands.setContent(result.content);
          setDocumentName(result.fileName);
          setRefreshKey((value) => value + 1);
          toast.success(formatMessage(t('openedFileToast'), { name: file.name }), { id: 'import' });
        } catch (error) {
          console.error('Import error:', error);
          toast.error(t('importFailed'), { id: 'import' });
        } finally {
          setIsImporting(false);
        }
      };

      input.click();
    } catch (error) {
      console.error('Open failed:', error);
      toast.error(t('openFailed'));
    }
  };

  const handleSave = () => {
    onSaveDocument();
    setRefreshKey((value) => value + 1);
  };

  const handleExportLibrary = () => {
    try {
      const documents = getLibraryDocuments();
      const payload = exportLibraryDocumentsFile(documents);
      const fileName = `lwrite-library-${new Date().toISOString().slice(0, 10)}.lwrite.json`;
      const blob = new Blob([payload], { type: 'application/json' });
      downloadBlob(blob, fileName);
      toast.success(
        formatMessage(t('exportedLibraryToast'), { count: documents.length }),
      );
    } catch (error) {
      console.error('Library export failed:', error);
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

      try {
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
        console.error('Library import failed:', error);
        toast.error(t('invalidLibraryFile'));
      }
    };
    input.click();
  };

  const handleImportSingleDocument = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.lwrite.json,application/json';
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const raw = await file.text();
        const doc = importSingleLibraryDocument(raw);
        setRefreshKey((value) => value + 1);
        toast.success(`${t('importedSingleDocToast')}: ${doc.name}`);
      } catch (error) {
        console.error('Single document import failed:', error);
        toast.error(t('invalidLibraryFile'));
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
      console.error('Document export failed:', error);
      toast.error(t('exportDocumentFailed'));
    }
  };

  const handleDuplicateLibraryDocument = (doc: StoredDocument) => {
    try {
      const duplicated = duplicateLibraryDocument(doc.id);
      setRefreshKey((value) => value + 1);
      toast.success(formatMessage(t('documentDuplicatedToast'), { name: duplicated.name }));
    } catch (error) {
      console.error('Document duplicate failed:', error);
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
      deleteLibraryDocument(doc.id);
      setRefreshKey((value) => value + 1);
      toast.success(formatMessage(t('documentDeletedToast'), { name: doc.name }));
    } catch (error) {
      console.error('Document delete failed:', error);
      toast.error(t('deleteDocumentFailed'));
    }
  };

  const handleOpenLibraryDocument = async (doc: StoredDocument) => {
    if (hasUnsavedChanges && !(await confirmDiscardUnsavedChanges())) {
      return;
    }
    onLoadDocument(doc);
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
      console.error('Export failed:', error);
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 px-3 gap-2 font-medium">
            <Folder className="h-4 w-4" />
            {t('fileMenuLabel')}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 bg-popover border border-border shadow-lg z-50" align="start">
          <DropdownMenuItem onClick={() => void handleNewDocument()}>
            <FilePlus className="h-4 w-4 mr-2" />
            {t('fileMenuNewDocument')}
            <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void handleOpenFile()} disabled={isImporting}>
            <FolderOpen className="h-4 w-4 mr-2" />
            {isImporting ? t('importInProgress') : t('fileMenuOpen')}
            <span className="ml-auto text-xs text-muted-foreground">⌘O</span>
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
              <DropdownMenuItem onClick={handleImportLibrary}>
                <Upload className="h-4 w-4 mr-2" />
                {t('importAllDocs')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleImportSingleDocument}>
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
          <DropdownMenuItem onClick={onShowVersionHistory}>
            <History className="h-4 w-4 mr-2" />
            {t('fileMenuVersionHistory')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-md">
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
            <Button onClick={handleRename}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="bg-background border border-border shadow-lg sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('documentLibrary')}</DialogTitle>
            <DialogDescription>
              {t('documentLibraryDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder={t('searchByTitleOrContent')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label={t('searchSavedDocumentsAria')}
            />
            <ScrollArea className="h-[320px] border rounded-md">
              <div className="p-2 space-y-2">
                {filteredDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">{t('noMatchingDocuments')}</p>
                ) : (
                  filteredDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`grid gap-2 rounded-md border p-3 transition hover:bg-accent ${
                        doc.id === documentId ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => void handleOpenLibraryDocument(doc)}
                      >
                        <div className="truncate font-medium">{doc.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatMessage(t('librarySavedAt'), {
                            date: new Date(doc.updatedAt).toLocaleString(locale),
                          })}
                        </div>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportLibraryDocument(doc)}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          {t('exportDocumentBackup')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleDuplicateLibraryDocument(doc)}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          {t('duplicateDocument')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void handleDeleteLibraryDocument(doc)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t('deleteDocument')}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLibraryOpen(false)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
