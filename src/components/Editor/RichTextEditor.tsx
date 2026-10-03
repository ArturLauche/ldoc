import { useEditor, EditorContent } from '@tiptap/react';
import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/useLocale';
import { useAutoHideOnScroll } from '@/hooks/useAutoHideOnScroll';
import { useCompactLayout } from '@/hooks/useMediaQuery';
import { useVisualViewportVars } from '@/hooks/useVisualViewport';
import { trackInputModality } from '@/lib/inputModality';
import { cn } from '@/lib/utils';
import { createEditorExtensions } from './editorExtensions';
import { HeaderPreferences } from './HeaderPreferences';
import { SaveStatus } from './SaveStatus';
import { useDocumentSession } from './useDocumentSession';

const FileMenu = lazy(() => import('./FileMenu').then((module) => ({ default: module.FileMenu })));

const EditorToolbar = lazy(() =>
  import('./EditorToolbar').then((module) => ({
    default: module.EditorToolbar,
  })),
);

const MobileToolbar = lazy(() =>
  import('./MobileToolbar').then((module) => ({
    default: module.MobileToolbar,
  })),
);

const VersionHistory = lazy(() =>
  import('./VersionHistory').then((module) => ({
    default: module.VersionHistory,
  })),
);

const FindReplaceBar = lazy(() =>
  import('./FindReplaceBar').then((module) => ({
    default: module.FindReplaceBar,
  })),
);

const FileMenuFallback = ({ compact }: { compact: boolean }) => (
  <div
    aria-hidden="true"
    className={cn('h-9 shrink-0 rounded-md bg-transparent', compact ? 'w-11' : 'w-[5.25rem]')}
  />
);

const ToolbarFallback = () => <div aria-hidden="true" className="h-10" />;

export const RichTextEditor = () => {
  const { t, locale } = useLocale();
  const compact = useCompactLayout();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [contextSlot, setContextSlot] = useState<HTMLDivElement | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  // Phones get the document height back while scrolling down or typing.
  const headerHidden = useAutoHideOnScroll(compact && !showFindReplace, headerRef);

  useVisualViewportVars();
  useEffect(() => trackInputModality(), []);

  // The schema stays stable. Locale changes update decorations through a command.
  const [extensions] = useState(() => createEditorExtensions(() => t('placeholder')));

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    editable: false,
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
    isLoading,
    isTransitioning,
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

  const chromeInert = isLoading || isTransitioning;

  return (
    <div className={cn('min-h-dvh bg-background flex flex-col app-shell', compact && 'is-compact')}>
      {/* Keyboard/assistive-tech skip link: visually hidden until focused,
          so the interface stays uncluttered while remaining navigable. */}
      <a
        href="#lwrite-editor"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground focus:shadow-lg"
      >
        {t('skipToEditor')}
      </a>
      <header
        ref={headerRef}
        inert={chromeInert}
        className={cn('editor-header sticky top-0 z-40', headerHidden && 'is-hidden')}
        data-editor-chrome
        data-scroll-inset="top"
      >
        {/* Header */}
        <div className="app-bar">
          <div className="app-bar-row">
            <div className="flex items-center gap-1.5 shrink-0">
              <BrandLogo />
              <span className="hidden sm:inline font-semibold text-sm tracking-tight">LWrite</span>
            </div>

            <Suspense fallback={<FileMenuFallback compact={compact} />}>
              <FileMenu
                compact={compact}
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
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  editor?.commands.focus();
                }
              }}
              onBlur={(event) => {
                // Long names show their beginning again after editing the end.
                event.currentTarget.scrollLeft = 0;
              }}
              enterKeyHint="done"
              autoComplete="off"
              className="document-title h-9 rounded-sm px-2 text-sm font-medium bg-transparent border border-transparent outline-hidden hover:border-border/50 focus:border-border focus:bg-card placeholder:text-muted-foreground truncate transition-colors"
              placeholder={t('untitledDocument')}
              aria-label={t('documentName')}
            />

            {compact ? null : <div ref={setContextSlot} className="header-context-slot" />}

            <div className="flex items-center gap-0.5 shrink-0 sm:gap-1">
              <SaveStatus
                saveError={Boolean(saveError)}
                hasExternalChanges={hasExternalChanges}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSaved={lastSaved}
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn('header-icon-button', showFindReplace && 'bg-accent')}
                onClick={() => setShowFindReplace((value) => !value)}
                aria-label={t('findReplaceTitle')}
                aria-pressed={showFindReplace}
              >
                <Search className="h-4 w-4" />
              </Button>
              <HeaderPreferences compact={compact} />
            </div>
          </div>
        </div>

        {/* Toolbar: phones dock theirs at the bottom instead. */}
        {compact ? null : (
          <div className="toolbar-bar px-3 py-2 sm:px-5">
            <Suspense fallback={<ToolbarFallback />}>
              <EditorToolbar editor={editor} contextSlot={contextSlot} />
            </Suspense>
          </div>
        )}

        {showFindReplace ? (
          <Suspense fallback={null}>
            <FindReplaceBar
              key={documentId}
              editor={editor}
              compact={compact}
              onClose={closeFindReplace}
            />
          </Suspense>
        ) : null}
      </header>

      {hasExternalChanges ? (
        <div role="alert" className="session-notice" data-editor-chrome>
          <p>{t('externalChanges')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={isLoading || isTransitioning} onClick={saveConflictCopy}>
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
        aria-busy={isLoading || isTransitioning}
        className="editor-main flex-1 max-w-4xl mx-auto w-full min-w-0"
      >
        <h1 className="sr-only" lang="en">
          LWrite – Private rich text editor
        </h1>
        <div className="editor-container">
          {(isLoading || isTransitioning) && (
            <p role="status" className="px-6 pt-4 text-sm text-muted-foreground">
              {t('loadingDocument')}
            </p>
          )}
          <EditorContent editor={editor} className="editor-content" />
        </div>
      </main>

      {compact ? (
        <div inert={chromeInert} className="contents">
          <Suspense fallback={null}>
            <MobileToolbar editor={editor} />
          </Suspense>
        </div>
      ) : null}

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
