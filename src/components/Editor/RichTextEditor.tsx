import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import FontFamily from '@tiptap/extension-font-family';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { useState, useEffect, useCallback } from 'react';
import { defaultLocale, getLocaleFromStorage, localeLabels, setLocaleInStorage, t, type Locale } from '@/lib/translations';
import { EditorToolbar } from './EditorToolbar';
import { FileMenu } from './FileMenu';
import { VersionHistory } from './VersionHistory';
import { toast } from 'sonner';
import { Cloud, FileText, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createDocumentId,
  migrateLegacyDocumentToLibrary,
  upsertLibraryDocument,
  type StoredDocument,
} from '@/lib/documentLibrary';

const AUTOSAVE_DELAY = 3000;
const EnhancedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => ({
          'data-align': attributes.align,
        }),
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-width'),
        renderHTML: (attributes) =>
          attributes.width
            ? {
                'data-width': attributes.width,
                style: `width: ${attributes.width}%;`,
              }
            : {},
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
});

export const RichTextEditor = () => {
  const [documentId, setDocumentId] = useState(() => createDocumentId());
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [documentName, setDocumentName] = useState(t(defaultLocale, 'untitledDocument'));
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  const { theme, resolvedTheme, setTheme } = useTheme();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer hover:text-primary/80',
        },
      }),
      Superscript,
      Subscript,
      FontFamily,
      Placeholder.configure({
        placeholder: t(locale, 'placeholder'),
      }),
      EnhancedImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto my-4 mx-auto block',
        },
      }),
    ],
    content: '<p></p>',
    onUpdate: () => {
      setHasUnsavedChanges(true);
      updateCounts();
    },
    editorProps: {
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none min-h-[500px] px-16 py-12',
        'aria-label': 'Document editor',
      },
    },
  });

  const updateCounts = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharacterCount(text.length);
  }, [editor]);

  const saveDocument = useCallback(
    (options?: { showToast?: boolean }) => {
      if (!editor) return;

      const content = editor.getHTML();
      const savedAt = new Date().toISOString();
      const savedDoc = upsertLibraryDocument({
        id: documentId,
        name: documentName,
        content,
        updatedAt: savedAt,
      });

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          id: savedDoc.id,
          name: savedDoc.name,
          content: savedDoc.content,
          savedAt,
        }),
      );

      setDocumentId(savedDoc.id);
      setLastSaved(new Date(savedAt));
      setHasUnsavedChanges(false);

      if (options?.showToast) {
        toast.success(t(locale, 'saveSuccess'));
      }
    },
    [documentId, documentName, editor, locale],
  );

  // Load saved document on mount
  useEffect(() => {
    migrateLegacyDocumentToLibrary();
    try {
      const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved) {
        const doc = JSON.parse(saved) as {
          id?: string;
          content?: string;
          name?: string;
          savedAt?: string;
        };
        if (doc.content && editor) {
          editor.commands.setContent(doc.content);
          setDocumentId(doc.id || createDocumentId());
          setDocumentName(doc.name || t(locale, 'untitledDocument'));
          setLastSaved(doc.savedAt ? new Date(doc.savedAt) : null);
          setHasUnsavedChanges(false);
          updateCounts();
        }
        if (!localStorage.getItem(STORAGE_KEY)) {
          localStorage.setItem(STORAGE_KEY, saved);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('Failed to load saved document:', error);
    }
  }, [editor, updateCounts, locale]);

  // Autosave
  useEffect(() => {
    if (!editor || !hasUnsavedChanges) return;

    const timer = setTimeout(() => {
      saveDocument();
    }, AUTOSAVE_DELAY);

    return () => clearTimeout(timer);
  }, [editor, hasUnsavedChanges, saveDocument, locale]);

  useEffect(() => {
    if (editor) {
      updateCounts();
    }
  }, [editor, updateCounts, locale]);


  useEffect(() => {
    setLocale(getLocaleFromStorage());
  }, []);

  useEffect(() => {
    setLocaleInStorage(locale);
  }, [locale]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveDocument({ showToast: true });
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          if (confirm(t(locale, 'unsavedConfirm'))) {
            editor?.commands.setContent('<p></p>');
            setDocumentId(createDocumentId());
            setDocumentName(t(locale, 'untitledDocument'));
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        } else {
          editor?.commands.setContent('<p></p>');
          setDocumentId(createDocumentId());
          setDocumentName(t(locale, 'untitledDocument'));
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, hasUnsavedChanges, saveDocument, locale]);

  const handleLoadSavedDocument = useCallback(
    (doc: StoredDocument) => {
      if (!editor) return;
      editor.commands.setContent(doc.content);
      setDocumentId(doc.id);
      setDocumentName(doc.name);
      setLastSaved(new Date(doc.updatedAt));
      setHasUnsavedChanges(false);
      updateCounts();
    },
    [editor, updateCounts],
  );

  const handleCreateNewDocument = useCallback(() => {
    if (!editor) return;
    editor.commands.setContent('<p></p>');
    setDocumentId(createDocumentId());
    setDocumentName(t(locale, 'untitledDocument'));
    setLastSaved(null);
    setHasUnsavedChanges(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    updateCounts();
  }, [editor, updateCounts, locale]);

  const handleRestoreVersion = useCallback((content: string) => {
    if (editor) {
      editor.commands.setContent(content);
      setHasUnsavedChanges(true);
    }
  }, [editor]);

  return (
    <div className="min-h-screen bg-background flex flex-col app-shell">
      <div className="sticky top-0 z-40">
        {/* Header */}
        <header className="glass-bar app-header">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <span className="font-semibold text-lg tracking-tight">LWrite</span>
              </div>
              
              <FileMenu
                editor={editor}
                documentId={documentId}
                documentName={documentName}
                setDocumentName={setDocumentName}
                onSaveDocument={() => saveDocument({ showToast: true })}
                onLoadDocument={handleLoadSavedDocument}
                onCreateNewDocument={handleCreateNewDocument}
                onShowVersionHistory={() => setShowVersionHistory(true)}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <span>{t(locale, 'language')}</span>
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as Locale)}
                  className="bg-background border rounded-md px-2 py-1 text-sm"
                  aria-label={t(locale, 'language')}
                >
                  {Object.entries(localeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                size="icon"
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
              {/* Save Status */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {hasUnsavedChanges ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>{t(locale, 'unsavedChanges')}</span>
                  </>
                ) : lastSaved ? (
                  <>
                    <Cloud className="h-4 w-4 text-emerald-500" />
                    <span>{t(locale, 'saved')}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Document Title */}
          <div className="px-4 pb-3">
            <input
              type="text"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              className="text-xl font-semibold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/50"
              placeholder={t(locale, 'untitledDocument')}
              aria-label={t(locale, 'documentName')}
            />
          </div>
        </header>

        {/* Toolbar */}
        <div className="px-4 py-2 glass-bar glass-bar--toolbar">
          <EditorToolbar editor={editor} />
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

      {/* Version History Modal */}
      <VersionHistory
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        onRestore={handleRestoreVersion}
        currentContent={editor?.getHTML() || ''}
        documentName={documentName}
      />
    </div>
  );
};
