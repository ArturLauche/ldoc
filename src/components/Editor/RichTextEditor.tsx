import { useEditor, EditorContent } from '@tiptap/react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Cloud, FileText, Languages, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isSupportedLocale, localeNames, supportedLocales } from '@/lib/translations';
import { useLocale } from '@/components/locale-provider';
import { createEditorExtensions } from './editorExtensions';
import { useDocumentSession } from './useDocumentSession';

const FileMenu = lazy(() =>
  import('./FileMenu').then((module) => ({ default: module.FileMenu })),
);

const EditorToolbar = lazy(() =>
  import('./EditorToolbar').then((module) => ({ default: module.EditorToolbar })),
);

const VersionHistory = lazy(() =>
  import('./VersionHistory').then((module) => ({ default: module.VersionHistory })),
);

const FindReplaceBar = lazy(() =>
  import('./FindReplaceBar').then((module) => ({ default: module.FindReplaceBar })),
);

const FileMenuFallback = () => (
  <div aria-hidden="true" className="h-9 w-[5.75rem] flex-shrink-0 rounded-md bg-transparent" />
);

const ToolbarFallback = () => (
  <div aria-hidden="true" className="floating-toolbar h-12 p-2" />
);

export const RichTextEditor = () => {
  const { t, locale, setLocale } = useLocale();
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  // The extension list is created once; the placeholder reads the latest
  // translation through a ref so switching languages never rebuilds the editor.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const extensions = useMemo(
    () => createEditorExtensions(() => tRef.current('placeholder')),
    [],
  );

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] px-16 py-12',
        'aria-label': 'Document editor',
      },
    },
  });
  const {
    documentId,
    documentName,
    lastSaved,
    hasUnsavedChanges,
    wordCount,
    characterCount,
    saveDocument,
    loadDocument,
    createNewDocument,
    renameDocument,
    restoreVersion,
  } = useDocumentSession(editor);

  // An empty transaction makes decorations (the placeholder text) recompute
  // so a language switch is reflected without document changes.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr);
  }, [editor, locale]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        setShowFindReplace(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col app-shell">
      <div className="sticky top-0 z-40">
        {/* Header */}
        <header className="glass-bar">
          <div className="flex items-center justify-between px-4 h-12">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="p-1 rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <span className="font-semibold text-sm tracking-tight">LWrite</span>
              </div>

              <Suspense fallback={<FileMenuFallback />}>
                <FileMenu
                  editor={editor}
                  documentId={documentId}
                  documentName={documentName}
                  setDocumentName={renameDocument}
                  onSaveDocument={() => saveDocument({ showToast: true })}
                  onLoadDocument={loadDocument}
                  onCreateNewDocument={createNewDocument}
                  onShowVersionHistory={() => setShowVersionHistory(true)}
                  hasUnsavedChanges={hasUnsavedChanges}
                />
              </Suspense>

              <div className="h-5 w-px bg-border/40 flex-shrink-0 hidden sm:block" />

              <input
                type="text"
                value={documentName}
                onChange={(e) => renameDocument(e.target.value)}
                className="text-sm font-medium bg-transparent border-none outline-none min-w-0 flex-1 placeholder:text-muted-foreground/50 truncate"
                placeholder={t('untitledDocument')}
                aria-label={t('documentName')}
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Save Status */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {hasUnsavedChanges ? (
                  <>
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="hidden sm:inline">{t('unsavedChanges')}</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="hidden sm:inline">{t('saved')}</span>
                  </>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowFindReplace((value) => !value)}
                aria-label={t('findReplaceTitle')}
                aria-pressed={showFindReplace}
              >
                <Search className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('languageSwitcherLabel')}
                  >
                    <Languages className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-40 bg-popover border border-border shadow-lg z-50"
                >
                  <DropdownMenuRadioGroup
                    value={locale}
                    onValueChange={(value) => {
                      if (isSupportedLocale(value)) setLocale(value);
                    }}
                  >
                    {supportedLocales.map((code) => (
                      <DropdownMenuRadioItem key={code} value={code}>
                        {localeNames[code]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const activeTheme = theme === 'system' ? resolvedTheme : theme;
                  setTheme(activeTheme === 'dark' ? 'light' : 'dark');
                }}
                aria-label={t('toggleTheme')}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </header>

        {/* Toolbar */}
        <div className="px-4 py-2 glass-bar glass-bar--toolbar">
          <Suspense fallback={<ToolbarFallback />}>
            <EditorToolbar editor={editor} />
          </Suspense>
        </div>

        {showFindReplace ? (
          <Suspense fallback={null}>
            <FindReplaceBar editor={editor} onClose={() => setShowFindReplace(false)} />
          </Suspense>
        ) : null}
      </div>

      {/* Editor */}
      <main className="flex-1 max-w-4xl mx-auto w-full">
        <div className="editor-container glass-card shadow-floating my-6 mx-4 overflow-hidden">
          <EditorContent
            editor={editor}
            className="editor-content"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 glass-bar glass-bar--footer">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{wordCount} {t('words')}</span>
            <span>{characterCount} {t('characters')}</span>
          </div>
          {lastSaved && (
            <span>{t('lastSaved')}: {lastSaved.toLocaleTimeString(locale)}</span>
          )}
        </div>
      </footer>

      {showVersionHistory ? (
        <Suspense fallback={null}>
          <VersionHistory
            isOpen={showVersionHistory}
            onClose={() => setShowVersionHistory(false)}
            onRestore={restoreVersion}
            currentContent={editor?.getHTML() || ''}
            documentName={documentName}
            documentId={documentId}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
