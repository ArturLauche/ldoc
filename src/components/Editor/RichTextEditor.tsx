import { useEditor, EditorContent } from '@tiptap/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { useLocale } from '@/hooks/useLocale';
import { useAutoHideOnScroll } from '@/hooks/useAutoHideOnScroll';
import { useCompactLayout } from '@/hooks/useMediaQuery';
import { useVisualViewportVars } from '@/hooks/useVisualViewport';
import { trackInputModality } from '@/lib/inputModality';
import { cn } from '@/lib/utils';
import { SHORTCUTS } from './editorShortcuts';
import { EditorFooter } from './EditorFooter';
import { createEditorExtensions, editorAttributes } from './editorExtensions';
import { PreferencesMenu } from './PreferencesMenu';
import { SaveStatus } from './SaveStatus';
import { SessionNotice } from './SessionNotice';
import { ToolbarButton } from './toolbarControls';
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

const ShortcutsDialog = lazy(() =>
  import('./ShortcutsDialog').then((module) => ({
    default: module.ShortcutsDialog,
  })),
);

/** Same footprint as the File trigger, so the title does not shift when it loads. */
const FileMenuFallback = ({ compact }: { compact: boolean }) => (
  <div aria-hidden="true" className={cn('h-9 shrink-0', compact ? 'w-11' : 'w-[4.75rem]')} />
);

/** Reserves the toolbar row while its chunk loads. */
const ToolbarFallback = () => <div aria-hidden="true" className="h-9" />;

function isModKey(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey) && !event.altKey;
}

export const RichTextEditor = () => {
  const { t } = useLocale();
  const compact = useCompactLayout();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [contextSlot, setContextSlot] = useState<HTMLDivElement | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Phones get the document height back while scrolling down or typing.
  const headerHidden = useAutoHideOnScroll(compact && !showFindReplace, headerRef);

  useVisualViewportVars();
  useEffect(() => trackInputModality(), []);

  // The schema stays stable. Locale changes update decorations through a command.
  const [extensions] = useState(() => createEditorExtensions(() => t('placeholder')));
  const [initialLabel] = useState(() => t('documentEditor'));

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    editable: false,
    // Create the editor after commit so suspended/concurrent renders cannot
    // expose an instance that TipTap has already disposed.
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: editorAttributes(initialLabel) },
  });
  const {
    isLoading,
    isTransitioning,
    documentId,
    documentName,
    lastSaved,
    hasUnsavedChanges,
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
  const showHistory = useCallback(() => setShowVersionHistory(true), []);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setEditorPlaceholder(t('placeholder'));
    editor.setOptions({ editorProps: { attributes: editorAttributes(t('documentEditor')) } });
  }, [editor, t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isModKey(event) || document.querySelector('[role=dialog], [role=alertdialog]')) return;
      const key = event.key.toLowerCase();
      if (key === 'f' && !event.shiftKey) {
        event.preventDefault();
        setShowFindReplace(true);
        document.querySelector<HTMLInputElement>('[data-find-input]')?.focus();
      } else if (key === '/' || event.code === 'Slash') {
        event.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const busy = isLoading || isTransitioning;

  return (
    <div className={cn('app-shell flex min-h-dvh flex-col bg-background', compact && 'is-compact')}>
      {/* Keyboard/assistive-tech skip link: visually hidden until focused. */}
      <a href="#lwrite-editor" className="skip-link">
        {t('skipToEditor')}
      </a>
      <header
        ref={headerRef}
        inert={busy}
        className={cn('editor-header sticky top-0 z-40', headerHidden && 'is-hidden')}
        data-editor-chrome
        data-scroll-inset="top"
      >
        <div className="app-bar">
          <div className="app-bar-row">
            <div className="flex shrink-0 items-center gap-2 pe-1">
              <BrandLogo />
              <span className="hidden text-sm font-semibold tracking-tight sm:inline">LWrite</span>
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
                onShowVersionHistory={showHistory}
                onImportDocument={importDocument}
              />
            </Suspense>

            {/* The title sits next to the file controls so the header stays one row. */}
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
              spellCheck={false}
              className="document-title"
              placeholder={t('untitledDocument')}
              aria-label={t('documentName')}
            />

            {compact ? null : <div ref={setContextSlot} className="header-context-slot" />}

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <SaveStatus
                saveError={Boolean(saveError)}
                hasExternalChanges={hasExternalChanges}
                hasUnsavedChanges={hasUnsavedChanges}
                lastSaved={lastSaved}
              />
              <ToolbarButton
                label={t('findReplaceTitle')}
                shortcut={SHORTCUTS.find}
                className="header-icon-button"
                pressed={showFindReplace}
                onClick={() => setShowFindReplace((value) => !value)}
              >
                <Search />
              </ToolbarButton>
              <PreferencesMenu compact={compact} onShowShortcuts={() => setShowShortcuts(true)} />
            </div>
          </div>
        </div>

        {/* Toolbar: phones dock theirs at the bottom instead. */}
        {compact ? null : (
          <div className="toolbar-bar">
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

      <SessionNotice
        hasExternalChanges={hasExternalChanges}
        saveError={saveError}
        busy={busy}
        onSaveCopy={() => void saveConflictCopy()}
        onReloadSaved={() => void reloadExternalDocument()}
        onRetrySave={() => void handleSave()}
      />

      <main
        id="lwrite-editor"
        tabIndex={-1}
        aria-busy={busy}
        className="editor-main mx-auto w-full min-w-0 max-w-4xl flex-1"
      >
        <h1 className="sr-only" lang="en">
          LWrite – Private rich text editor
        </h1>
        <div className="editor-container">
          {busy ? (
            <p role="status" className="editor-loading">
              {t('loadingDocument')}
            </p>
          ) : null}
          <EditorContent editor={editor} className="editor-content" />
        </div>
      </main>

      {compact ? (
        <div inert={busy} className="contents">
          <Suspense fallback={null}>
            <MobileToolbar editor={editor} />
          </Suspense>
        </div>
      ) : null}

      <EditorFooter editor={editor} lastSaved={lastSaved} />

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

      {showShortcuts ? (
        <Suspense fallback={null}>
          <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
        </Suspense>
      ) : null}
    </div>
  );
};
