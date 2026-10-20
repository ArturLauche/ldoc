import { useEditor, EditorContent } from '@tiptap/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { BrandLogo } from '@/components/BrandLogo';
import { useLocale } from '@/hooks/useLocale';
import { useAutoHideOnScroll } from '@/hooks/useAutoHideOnScroll';
import { useCompactLayout } from '@/hooks/useMediaQuery';
import { useVisualViewportVars } from '@/hooks/useVisualViewport';
import { trackInputModality } from '@/lib/inputModality';
import { MAX_IMAGE_SIZE_MB } from '@/lib/media';
import { formatMessage } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { SHORTCUTS } from './editorShortcuts';
import { EditorFooter } from './EditorFooter';
import { IMAGE_FILE_ERROR_EVENT, type ImageFileErrorCode } from './imageFileExtension';
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

/**
 * Mod+/ by the character it types. The physical Slash key also counts when
 * it types a non-ASCII character; an ASCII one belongs to another shortcut
 * (on German layouts it types "-", zoom out; on Russian ones ".", superscript).
 */
function isShortcutsKey(event: KeyboardEvent) {
  if (event.key === '/') return true;
  const ascii = event.key.length === 1 && event.key.charCodeAt(0) < 128;
  return event.code === 'Slash' && event.key.length === 1 && !ascii;
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
  // Where focus was when the shortcut reference opened; it has no trigger of
  // its own for Radix to return to.
  const shortcutsReturnRef = useRef<HTMLElement | null>(null);
  const openShortcuts = useCallback((returnFocusTo: Element | null) => {
    shortcutsReturnRef.current = returnFocusTo instanceof HTMLElement ? returnFocusTo : null;
    setShowShortcuts(true);
  }, []);
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
    // TipTap re-applies these options after every render, so the accessible
    // name follows the current language here rather than in an effect.
    editorProps: { attributes: editorAttributes(t('documentEditor')) },
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
  }, [editor, t]);

  useEffect(() => {
    const onImageFileError = (event: Event) => {
      const code = (event as CustomEvent<ImageFileErrorCode>).detail;
      toast.error(
        code === 'too-large'
          ? formatMessage(t('imageErrorTooLarge'), { maxSize: MAX_IMAGE_SIZE_MB })
          : code === 'read-failed'
            ? t('imageUploadFailed')
            : t(code === 'not-image-drop' ? 'imageDropNotImage' : 'imageErrorNotImage'),
      );
    };
    // A file dropped beside the document must not replace the app with that file.
    const keepFilesInApp = (event: DragEvent) => {
      if (!event.defaultPrevented && event.dataTransfer?.types.includes('Files')) {
        event.preventDefault();
      }
    };
    document.addEventListener(IMAGE_FILE_ERROR_EVENT, onImageFileError);
    window.addEventListener('dragover', keepFilesInApp);
    window.addEventListener('drop', keepFilesInApp);
    return () => {
      document.removeEventListener(IMAGE_FILE_ERROR_EVENT, onImageFileError);
      window.removeEventListener('dragover', keepFilesInApp);
      window.removeEventListener('drop', keepFilesInApp);
    };
  }, [t]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isModKey(event) || document.querySelector('[role=dialog], [role=alertdialog]')) return;
      const key = event.key.toLowerCase();
      if (key === 'f' && !event.shiftKey) {
        event.preventDefault();
        setShowFindReplace(true);
        document.querySelector<HTMLInputElement>('[data-find-input]')?.focus();
      } else if (!event.defaultPrevented && isShortcutsKey(event)) {
        // The editor already ran its own binding for this key (Mod+Shift+7
        // types "/" on German layouts) when the event comes back prevented.
        event.preventDefault();
        openShortcuts(document.activeElement);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openShortcuts]);

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

            {/* The status comes before the contextual tools, so its changing
                width moves into the free space instead of shifting them. */}
            <SaveStatus
              saveError={Boolean(saveError)}
              hasExternalChanges={hasExternalChanges}
              hasUnsavedChanges={hasUnsavedChanges}
              lastSaved={lastSaved}
            />

            {compact ? null : <div ref={setContextSlot} className="header-context-slot" />}

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <ToolbarButton
                label={t('findReplaceTitle')}
                shortcut={SHORTCUTS.find}
                className="header-icon-button"
                pressed={showFindReplace}
                onClick={() => setShowFindReplace((value) => !value)}
              >
                <Search />
              </ToolbarButton>
              <PreferencesMenu compact={compact} onShowShortcuts={openShortcuts} />
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
          <ShortcutsDialog
            open={showShortcuts}
            onOpenChange={setShowShortcuts}
            onReturnFocus={() => {
              const target = shortcutsReturnRef.current;
              if (target?.isConnected && target !== editor?.view.dom) target.focus();
              else if (editor && !editor.isDestroyed) editor.commands.focus();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};
