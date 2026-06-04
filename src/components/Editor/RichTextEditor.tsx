import { useEditor, EditorContent } from '@tiptap/react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { getBrowserLocale, t, type Locale } from '@/lib/translations';
import { EditorToolbar } from './EditorToolbar';
import { FileMenu } from './FileMenu';
import { Cloud, FileText, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { createEditorExtensions } from './editorExtensions';
import { useDocumentSession } from './useDocumentSession';

const VersionHistory = lazy(() =>
  import('./VersionHistory').then((module) => ({ default: module.VersionHistory })),
);

export const RichTextEditor = () => {
  const [locale] = useState<Locale>(() => getBrowserLocale());
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const extensions = useMemo(() => createEditorExtensions(locale), [locale]);

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
  } = useDocumentSession(editor, locale);

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
              
              <FileMenu
                editor={editor}
                locale={locale}
                documentId={documentId}
                documentName={documentName}
                setDocumentName={renameDocument}
                onSaveDocument={() => saveDocument({ showToast: true })}
                onLoadDocument={loadDocument}
                onCreateNewDocument={createNewDocument}
                onShowVersionHistory={() => setShowVersionHistory(true)}
                hasUnsavedChanges={hasUnsavedChanges}
              />

              <div className="h-5 w-px bg-border/40 flex-shrink-0 hidden sm:block" />

              <input
                type="text"
                value={documentName}
                onChange={(e) => renameDocument(e.target.value)}
                className="text-sm font-medium bg-transparent border-none outline-none min-w-0 flex-1 placeholder:text-muted-foreground/50 truncate"
                placeholder={t(locale, 'untitledDocument')}
                aria-label={t(locale, 'documentName')}
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Save Status */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {hasUnsavedChanges ? (
                  <>
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="hidden sm:inline">{t(locale, 'unsavedChanges')}</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="hidden sm:inline">{t(locale, 'saved')}</span>
                  </>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const activeTheme = theme === 'system' ? resolvedTheme : theme;
                  setTheme(activeTheme === 'dark' ? 'light' : 'dark');
                }}
                aria-label={t(locale, 'toggleTheme')}
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
          <EditorToolbar editor={editor} locale={locale} />
        </div>
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
            <span>{wordCount} {t(locale, 'words')}</span>
            <span>{characterCount} {t(locale, 'characters')}</span>
          </div>
          {lastSaved && (
            <span>{t(locale, 'lastSaved')}: {lastSaved.toLocaleTimeString()}</span>
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
