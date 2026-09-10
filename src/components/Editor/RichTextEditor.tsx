import { useEditor, EditorContent } from '@tiptap/react';
import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { Check, Circle, HardDrive, Languages, Moon, Search, Sun, AlertCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isSupportedLocale, localeNames, supportedLocales } from '@/lib/translations';
import { useLocale } from '@/hooks/useLocale';
import { createEditorExtensions } from './editorExtensions';
import { useDocumentSession } from './useDocumentSession';

const FileMenu = lazy(() => import('./FileMenu').then((module) => ({ default: module.FileMenu })));

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
  <div aria-hidden="true" className="h-8 w-[5.25rem] shrink-0 rounded-md bg-transparent" />
);

const ToolbarFallback = () => <div aria-hidden="true" className="h-10" />;

export const RichTextEditor = () => {
  const { t, locale, setLocale } = useLocale();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  // The schema stays stable. Locale changes update decorations through a command.
  const [extensions] = useState(() => createEditorExtensions(() => t('placeholder')));

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    // Create the editor after commit so suspended/concurrent renders cannot
    // expose an instance that TipTap has already disposed.
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'prose max-w-none focus:outline-hidden',
        role: 'textbox',
        dir: 'auto',
        'aria-multiline': 'true',
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
    importDocument,
    saveError,
    hasExternalChanges,
    saveConflictCopy,
    reloadExternalDocument,
  } = useDocumentSession(editor);

  const closeFindReplace = useCallback(() => {
    setShowFindReplace(false);
    editor?.commands.focus();
  }, [editor]);
  const handleSave = useCallback(() => saveDocument({ showToast: true }), [saveDocument]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setEditorPlaceholder(t('placeholder'));
  }, [editor, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !document.querySelector('[role=dialog], [role=alertdialog]') &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'f'
      ) {
        event.preventDefault();
        setShowFindReplace(true);
        document.querySelector<HTMLInputElement>('[data-find-input]')?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-dvh bg-background flex flex-col app-shell">
      {/* Keyboard/assistive-tech skip link: visually hidden until focused,
          so the interface stays uncluttered while remaining navigable. */}
      <a
        href="#lwrite-editor"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground focus:shadow-lg"
      >
        {t('skipToEditor')}
      </a>
      <header className="sticky top-0 z-40" data-editor-chrome>
        {/* Header */}
        <div className="app-bar">
          <div className="flex items-center justify-between gap-2 px-3 h-12 sm:px-5">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 shrink-0">
                <BrandLogo />
                <span className="hidden sm:inline font-semibold text-sm tracking-tight">
                  LWrite
                </span>
              </div>

              <Suspense fallback={<FileMenuFallback />}>
                <FileMenu
                  menuTriggerRef={menuTriggerRef}
                  editor={editor}
                  documentId={documentId}
                  documentName={documentName}
                  setDocumentName={renameDocument}
                  onSaveDocument={handleSave}
                  onLoadDocument={loadDocument}
                  onCreateNewDocument={createNewDocument}
                  onShowVersionHistory={() => setShowVersionHistory(true)}
                  onImportDocument={importDocument}
                />
              </Suspense>

              {/* The title sits directly next to the file controls so the
                  header stays a single compact row. */}
              <input
                type="text"
                value={documentName}
                onChange={(e) => renameDocument(e.target.value)}
                className="h-9 rounded-sm px-2 text-sm font-medium bg-transparent border border-transparent outline-hidden min-w-0 w-full max-w-[22rem] hover:border-border/50 focus:border-border focus:bg-card placeholder:text-muted-foreground truncate transition-colors"
                placeholder={t('untitledDocument')}
                aria-label={t('documentName')}
              />
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div
                role="status"
                className="hidden items-center gap-1.5 pr-2 text-xs text-muted-foreground md:flex"
              >
                {saveError || hasExternalChanges ? (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                ) : hasUnsavedChanges ? (
                  <Circle className="h-2 w-2 fill-current" />
                ) : lastSaved ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <HardDrive className="h-3.5 w-3.5" />
                )}
                <span>
                  {saveError
                    ? t('unsavedChanges')
                    : hasExternalChanges
                      ? t('unsavedChanges')
                      : hasUnsavedChanges
                        ? t('unsavedChanges')
                        : lastSaved
                          ? t('savedLocally')
                          : t('localOnly')}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowFindReplace((value) => !value)}
                aria-label={t('findReplaceTitle')}
                aria-pressed={showFindReplace}
              >
                <Search className="h-4 w-4" />
              </Button>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={t('languageSwitcherLabel')}
                  >
                    <Languages className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  aria-label={t('languageSwitcherLabel')}
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
                className="h-9 w-9"
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
        </div>

        {/* Toolbar */}
        <div className="toolbar-bar px-3 py-2 sm:px-5">
          <Suspense fallback={<ToolbarFallback />}>
            <EditorToolbar editor={editor} />
          </Suspense>
        </div>

        {showFindReplace ? (
          <Suspense fallback={null}>
            <FindReplaceBar key={documentId} editor={editor} onClose={closeFindReplace} />
          </Suspense>
        ) : null}
      </header>

      {hasExternalChanges ? (
        <div role="alert" className="session-notice" data-editor-chrome>
          <p>{t('externalChanges')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveConflictCopy}>
              {t('saveAsCopy')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void reloadExternalDocument()}>
              {t('reloadSaved')}
            </Button>
          </div>
        </div>
      ) : saveError ? (
        <div role="alert" className="session-notice" data-editor-chrome>
          <p>{t(saveError === 'load' ? 'loadFailed' : 'saveFailed')}</p>
          {saveError === 'save' && (
            <Button variant="outline" size="sm" onClick={handleSave}>
              {t('retrySave')}
            </Button>
          )}
        </div>
      ) : null}

      {/* Editor */}
      <main
        id="lwrite-editor"
        tabIndex={-1}
        className="editor-main flex-1 max-w-4xl mx-auto w-full min-w-0"
      >
        <h1 className="sr-only" lang="en">
          LWrite – Private rich text editor
        </h1>
        <div className="editor-container my-5 mx-3 sm:my-8 sm:mx-6">
          <EditorContent editor={editor} className="editor-content" />
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer px-4 py-3" data-editor-chrome>
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="tabular-nums">
              {wordCount.toLocaleString(locale)} {t('words')}
            </span>
            <span className="tabular-nums">
              {characterCount.toLocaleString(locale)} {t('characters')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {lastSaved && (
              <span>
                {t('lastSaved')}: {lastSaved.toLocaleTimeString(locale)}
              </span>
            )}
            <nav className="flex items-center gap-3">
              <Link
                to={locale === 'de' ? '/datenschutz' : '/privacy'}
                className="hover:text-foreground transition-colors"
              >
                {t('privacyPolicy')}
              </Link>
              <Link
                to={locale === 'de' ? '/nutzung' : '/terms'}
                className="hover:text-foreground transition-colors"
              >
                {t('termsOfUse')}
              </Link>
            </nav>
          </div>
        </div>
      </footer>

      {showVersionHistory ? (
        <Suspense fallback={null}>
          <VersionHistory
            key={documentId}
            returnFocusRef={menuTriggerRef}
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
