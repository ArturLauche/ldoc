import { useId, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Download,
  FilePlus,
  Folder,
  FolderOpen,
  History,
  Library,
  PenLine,
  Printer,
  Save,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
import { useLocale } from '@/hooks/useLocale';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import type { StoredDocument } from '@/lib/documentLibrary';
import { DocumentLibraryDialog } from './DocumentLibraryDialog';
import { SHORTCUTS } from './editorShortcuts';
import { FileSheet } from './FileSheet';
import { EXPORT_FORMATS, useFileActions } from './useFileActions';
import { ShortcutLabel } from './toolbarControls';

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

function RenameForm({
  currentName,
  onRename,
  onCancel,
}: {
  currentName: string;
  onRename: (name: string) => boolean;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const inputId = useId();
  // Mounted with the dialog content, so every opening starts from the current name.
  const [name, setName] = useState(currentName);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onRename(name);
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('renameDocument')}</DialogTitle>
        <DialogDescription>{t('renameDocumentDescription')}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>{t('renameDocumentNameLabel')}</Label>
        <Input
          id={inputId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          autoComplete="off"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  currentName,
  onRename,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onRename: (name: string) => boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <RenameForm currentName={currentName} onRename={onRename} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
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
  const { t } = useLocale();
  const fileMenu = useTouchSafeMenu();
  const [sheetOpen, setSheetOpen] = useState(false);
  const actions = useFileActions({
    editor,
    documentId,
    documentName,
    setDocumentName,
    onSaveDocument,
    onLoadDocument,
    onCreateNewDocument,
    onImportDocument,
  });

  return (
    <>
      {compact ? (
        <FileSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          triggerRef={triggerRef}
          documentName={documentName}
          actions={actions}
          onShowVersionHistory={onShowVersionHistory}
        />
      ) : (
        <DropdownMenu modal={false} open={fileMenu.open} onOpenChange={fileMenu.onOpenChange}>
          <DropdownMenuTrigger asChild {...fileMenu.triggerProps}>
            <Button ref={triggerRef} variant="ghost" className="gap-1.5 px-2.5 data-[state=open]:bg-accent">
              <Folder />
              {t('fileMenuLabel')}
              <ChevronDown className="size-3.5! text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={t('fileMenuLabel')} className="w-64" align="start">
            <DropdownMenuItem onSelect={() => void actions.newDocument()}>
              <FilePlus />
              {t('fileMenuNewDocument')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.openFile} disabled={actions.isImporting}>
              <FolderOpen />
              {actions.isImporting ? t('importInProgress') : t('fileMenuOpen')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.library.setOpen(true)}>
              <Library />
              {t('searchDocuments')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void actions.save()}>
              <Save />
              {t('fileMenuSave')}
              <DropdownMenuShortcut>
                <ShortcutLabel shortcut={SHORTCUTS.save} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.renameDialog.setOpen(true)}>
              <PenLine />
              {t('fileMenuRename')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onShowVersionHistory}>
              <History />
              {t('fileMenuVersionHistory')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Download />
                {t('fileMenuExportAs')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-52">
                {EXPORT_FORMATS.map(({ format, label }) => (
                  <DropdownMenuItem
                    key={format}
                    onSelect={() => void actions.exportAs(format)}
                    disabled={actions.isExporting}
                  >
                    {t(label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Archive />
                {t('libraryTransfer')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-60">
                <DropdownMenuItem onSelect={actions.importFiles} disabled={actions.isImporting}>
                  <Upload />
                  {t('importSingleDoc')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void actions.exportLibrary()} disabled={actions.isExporting}>
                  <Archive />
                  {t('exportAllDocs')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={actions.importLibrary} disabled={actions.isImporting}>
                  <ArchiveRestore />
                  {t('importAllDocs')}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={actions.print}>
              <Printer />
              {t('fileMenuPrint')}
              <DropdownMenuShortcut>
                <ShortcutLabel shortcut="Mod+P" />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <RenameDialog
        open={actions.renameDialog.open}
        onOpenChange={actions.renameDialog.setOpen}
        currentName={documentName}
        onRename={actions.rename}
        returnFocusRef={triggerRef}
      />

      <DocumentLibraryDialog
        returnFocusRef={triggerRef}
        open={actions.library.open}
        onOpenChange={actions.library.setOpen}
        documents={actions.library.documents}
        listedAt={actions.library.listedAt}
        currentId={documentId}
        error={actions.library.error}
        loading={actions.library.loading}
        importing={actions.isImporting}
        onImport={actions.importFiles}
        onOpen={(doc) => void actions.openLibraryDocument(doc)}
        onExport={actions.exportLibraryDocument}
        onDuplicate={(doc) => void actions.duplicateDocument(doc)}
        onDelete={(doc) => void actions.deleteDocument(doc)}
      />
    </>
  );
};
