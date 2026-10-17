import { useRef, type ReactNode, type RefObject } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/hooks/useLocale';
import { focusContainerOnTouch } from '@/lib/inputModality';
import { EXPORT_FORMATS, type FileActions } from './useFileActions';

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

interface FileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  documentName: string;
  actions: FileActions;
  onShowVersionHistory: () => void;
}

/** Phone file actions: one bottom sheet with direct buttons instead of nested menus. */
export function FileSheet({
  open,
  onOpenChange,
  triggerRef,
  documentName,
  actions,
  onShowVersionHistory,
}: FileSheetProps) {
  const { t } = useLocale();
  // Dialogs opened from the sheet wait until it has closed and released focus.
  const afterCloseRef = useRef<(() => void) | null>(null);

  /** File pickers and downloads run within the tap; dialogs open after the sheet closes. */
  const run = (action: () => void, timing: 'now' | 'after-close' = 'now') => {
    if (timing === 'after-close') afterCloseRef.current = action;
    onOpenChange(false);
    if (timing === 'now') action();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        className="h-10 shrink-0 gap-0.5 px-2"
        aria-label={t('fileMenuLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
      >
        <Folder className="size-5!" />
        <ChevronDown className="size-3! text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="file-sheet flex flex-col gap-0 overflow-hidden p-0 [--sheet-padding-bottom:0.5rem] sm:max-w-sm"
          onOpenAutoFocus={focusContainerOnTouch}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const action = afterCloseRef.current;
            afterCloseRef.current = null;
            if (action) action();
            else triggerRef.current?.focus();
          }}
        >
          <DialogHeader className="border-b px-5 pb-3 pt-4">
            <DialogTitle>{t('fileMenuLabel')}</DialogTitle>
            <DialogDescription className="truncate">
              {documentName || t('untitledDocument')}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            <SheetSection>
              <SheetAction
                icon={<FilePlus />}
                label={t('fileMenuNewDocument')}
                onClick={() => run(() => void actions.newDocument(), 'after-close')}
              />
              <SheetAction
                icon={<FolderOpen />}
                label={actions.isImporting ? t('importInProgress') : t('fileMenuOpen')}
                disabled={actions.isImporting}
                onClick={() => run(actions.openFile)}
              />
              <SheetAction
                icon={<Save />}
                label={t('fileMenuSave')}
                onClick={() => run(() => void actions.save())}
              />
              <SheetAction
                icon={<PenLine />}
                label={t('fileMenuRename')}
                onClick={() => run(() => actions.renameDialog.setOpen(true), 'after-close')}
              />
              <SheetAction
                icon={<History />}
                label={t('fileMenuVersionHistory')}
                onClick={() => run(onShowVersionHistory, 'after-close')}
              />
              <SheetAction
                icon={<Printer />}
                label={t('fileMenuPrint')}
                onClick={() => run(actions.print, 'after-close')}
              />
            </SheetSection>
            <SheetSection label={t('documentLibrary')}>
              <SheetAction
                icon={<Library />}
                label={t('searchDocuments')}
                onClick={() => run(() => actions.library.setOpen(true), 'after-close')}
              />
              <SheetAction
                icon={<Upload />}
                label={t('importSingleDoc')}
                disabled={actions.isImporting}
                onClick={() => run(actions.importFiles)}
              />
              <SheetAction
                icon={<Archive />}
                label={t('exportAllDocs')}
                disabled={actions.isExporting}
                onClick={() => run(() => void actions.exportLibrary())}
              />
              <SheetAction
                icon={<ArchiveRestore />}
                label={t('importAllDocs')}
                disabled={actions.isImporting}
                onClick={() => run(actions.importLibrary)}
              />
            </SheetSection>
            <SheetSection label={t('fileMenuExportAs')}>
              <div className="file-sheet-formats">
                {EXPORT_FORMATS.map(({ format, label }) => (
                  <button
                    key={format}
                    type="button"
                    className="file-sheet-format"
                    aria-label={t(label)}
                    disabled={actions.isExporting}
                    onClick={() => run(() => void actions.exportAs(format))}
                  >
                    <span aria-hidden="true">{format.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </SheetSection>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
