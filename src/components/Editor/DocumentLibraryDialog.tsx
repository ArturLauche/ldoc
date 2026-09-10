import { useDeferredValue, useMemo, useState, type RefObject } from 'react';
import { Copy, Download, FileText, MoreHorizontal, Search, Trash2, Upload } from 'lucide-react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/useLocale';
import type { StoredDocument } from '@/lib/documentLibrary';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';

interface Props {
  returnFocusRef?: RefObject<HTMLButtonElement>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: StoredDocument[];
  currentId: string;
  error: boolean;
  importing: boolean;
  onImport: () => void;
  onOpen: (doc: StoredDocument) => void;
  onExport: (doc: StoredDocument) => void;
  onDuplicate: (doc: StoredDocument) => void;
  onDelete: (doc: StoredDocument) => void;
}

export function DocumentLibraryDialog({
  returnFocusRef,
  open,
  onOpenChange,
  documents,
  currentId,
  error,
  importing,
  onImport,
  onOpen,
  onExport,
  onDuplicate,
  onDelete,
}: Props) {
  const { t, locale } = useLocale();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase(locale));
  const entries = useMemo(
    () =>
      documents.map((doc) => {
        const parsed = new DOMParser().parseFromString(
          sanitizeDocumentHtml(doc.content),
          'text/html',
        );
        // textContent alone joins adjacent paragraphs/headings into one word.
        parsed.body.querySelectorAll('p,h1,h2,h3,li,tr,br,blockquote,pre,div').forEach((block) => {
          block.after(parsed.createTextNode(' '));
        });
        const text = (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
        return { doc, text, search: `${doc.name}\n${text}`.toLocaleLowerCase(locale) };
      }),
    [documents, locale],
  );
  const filtered = entries.filter((entry) => entry.search.includes(deferredQuery));
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{t('documentLibrary')}</DialogTitle>
          <DialogDescription>{t('documentLibraryDescription')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchByTitleOrContent')}
            aria-label={t('searchSavedDocumentsAria')}
            className="pl-9"
          />
        </div>
        <div
          className="min-h-48 max-h-[min(24rem,55dvh)] overflow-y-auto border-y border-border"
          aria-busy={query.trim().toLocaleLowerCase(locale) !== deferredQuery}
        >
          {error ? (
            <p role="alert" className="py-8 text-sm text-destructive">
              {t('libraryReadFailed')}
            </p>
          ) : filtered.length ? (
            <ul className="divide-y divide-border">
              {filtered.map(({ doc, text }) => (
                <li key={doc.id} className="flex items-center gap-2 py-1">
                  <button
                    type="button"
                    onClick={() => onOpen(doc)}
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-sm p-3 text-left hover:bg-accent"
                  >
                    <FileText
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{doc.name}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {text}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <time dateTime={doc.updatedAt}>
                          {dateFormat.format(new Date(doc.updatedAt))}
                        </time>
                        {doc.id === currentId && (
                          <span className="font-medium text-foreground">
                            {t('currentDocument')}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`${t('fileMenuLabel')}: ${doc.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onExport(doc)}>
                        <Download className="mr-2 h-4 w-4" />
                        {t('exportDocumentBackup')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onDuplicate(doc)}>
                        <Copy className="mr-2 h-4 w-4" />
                        {t('duplicateDocument')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onDelete(doc)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('deleteDocument')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium">
                {documents.length ? t('noMatchingDocuments') : t('libraryEmpty')}
              </p>
              {!documents.length && (
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  {t('libraryEmptyHint')}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between gap-3">
          <Button variant="outline" onClick={onImport} disabled={importing}>
            <Upload className="mr-2 h-4 w-4" />
            {t('importSingleDoc')}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
