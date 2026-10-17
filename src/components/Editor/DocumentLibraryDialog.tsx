import { useDeferredValue, useMemo, useState, type RefObject } from 'react';
import { AlertTriangle, Copy, Download, FileText, MoreHorizontal, Search, Trash2, Upload, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/useLocale';
import { useTouchSafeMenu } from '@/hooks/useTouchSafeMenu';
import type { StoredDocument } from '@/lib/documentLibrary';
import { documentPlainText } from '@/lib/documentText';
import { focusContainerOnTouch } from '@/lib/inputModality';
import { formatRecentDate } from '@/lib/relativeTime';
import { formatMessage } from '@/lib/translations';

interface Props {
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: StoredDocument[];
  currentId: string;
  error: boolean;
  loading?: boolean;
  importing: boolean;
  onImport: () => void;
  onOpen: (doc: StoredDocument) => void;
  onExport: (doc: StoredDocument) => void;
  onDuplicate: (doc: StoredDocument) => void;
  onDelete: (doc: StoredDocument) => void;
}

function DocumentActionsMenu({
  doc,
  onExport,
  onDuplicate,
  onDelete,
}: {
  doc: StoredDocument;
  onExport: (doc: StoredDocument) => void;
  onDuplicate: (doc: StoredDocument) => void;
  onDelete: (doc: StoredDocument) => void;
}) {
  const { t } = useLocale();
  // Rows sit in a scrolling list: a swipe that starts on the button must not open it.
  const menu = useTouchSafeMenu();
  return (
    <DropdownMenu open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild {...menu.triggerProps}>
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
          aria-label={formatMessage(t('documentActions'), { name: doc.name })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onDuplicate(doc)}>
          <Copy />
          {t('duplicateDocument')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport(doc)}>
          <Download />
          {t('exportDocumentBackup')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(doc)}>
          <Trash2 />
          {t('deleteDocument')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LoadingRows() {
  return (
    <ul aria-hidden="true" className="space-y-1 p-1">
      {[0, 1, 2].map((row) => (
        <li key={row} className="flex items-center gap-3 rounded-md px-2 py-2.5">
          <span className="size-8 shrink-0 animate-pulse rounded-md bg-muted" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-1/3 animate-pulse rounded-sm bg-muted" />
            <span className="block h-2.5 w-2/3 animate-pulse rounded-sm bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DocumentLibraryDialog({
  returnFocusRef,
  open,
  onOpenChange,
  documents,
  currentId,
  error,
  loading = false,
  importing,
  onImport,
  onOpen,
  onExport,
  onDuplicate,
  onDelete,
}: Props) {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const deferredQuery = useDeferredValue(normalizedQuery);
  const entries = useMemo(
    () =>
      documents.map((doc) => {
        const text = documentPlainText(`${doc.id}:${doc.updatedAt}`, doc.content);
        return { doc, text, search: `${doc.name}\n${text}`.toLocaleLowerCase(locale) };
      }),
    [documents, locale],
  );
  const filtered = deferredQuery
    ? entries.filter((entry) => entry.search.includes(deferredQuery))
    : entries;
  const [now] = useState(() => Date.now());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // A tap opens the list without covering it with the software keyboard.
        onOpenAutoFocus={focusContainerOnTouch}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
        className="flex flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <DialogHeader className="px-5 pb-3 pt-5">
          <DialogTitle>{t('documentLibrary')}</DialogTitle>
          <DialogDescription>{t('documentLibraryDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 px-5 pb-3">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchByTitleOrContent')}
              aria-label={t('searchSavedDocumentsAria')}
              enterKeyHint="search"
              autoComplete="off"
              className="flex h-9 w-full min-w-0 rounded-md border border-input bg-card ps-9 pe-9 text-base shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 md:text-sm pointer-coarse:h-10"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('graphicGalleryClearSearch')}
                className="absolute end-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button variant="outline" onClick={onImport} disabled={importing} className="min-w-0">
            <Upload />
            <span className="truncate max-sm:sr-only">{t('importSingleDoc')}</span>
          </Button>
        </div>
        <div
          className="min-h-48 flex-1 overflow-y-auto overscroll-contain border-t px-3 py-2 sm:max-h-[min(26rem,58dvh)] sm:flex-none"
          aria-busy={loading || normalizedQuery !== deferredQuery}
        >
          {loading ? (
            <>
              <p role="status" className="sr-only">
                {t('loadingDocument')}
              </p>
              <LoadingRows />
            </>
          ) : error ? (
            <div role="alert" className="flex items-start gap-2.5 px-2 py-6 text-sm text-destructive">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{t('libraryReadFailed')}</p>
            </div>
          ) : filtered.length ? (
            <ul className="space-y-0.5">
              {filtered.map(({ doc, text }) => {
                const current = doc.id === currentId;
                return (
                  <li key={doc.id} className="group flex items-center gap-1 rounded-md hover:bg-accent">
                    <button
                      type="button"
                      onClick={() => onOpen(doc)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 text-start focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground"
                      >
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium">{doc.name}</span>
                          {current ? (
                            <span className="shrink-0 rounded-sm bg-selected/12 px-1.5 py-px text-[11px] font-medium text-selected-foreground">
                              {t('currentDocument')}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {text || '—'}
                        </span>
                      </span>
                      <time
                        dateTime={doc.updatedAt}
                        className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block"
                      >
                        {formatRecentDate(new Date(doc.updatedAt), locale, now)}
                      </time>
                    </button>
                    <DocumentActionsMenu
                      doc={doc}
                      onExport={onExport}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                    />
                  </li>
                );
              })}
            </ul>
          ) : documents.length ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">{t('noMatchingDocuments')}</p>
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                {t('graphicGalleryClearSearch')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 py-12 text-center">
              <span
                aria-hidden="true"
                className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground"
              >
                <FileText className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">{t('libraryEmpty')}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t('libraryEmptyHint')}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
