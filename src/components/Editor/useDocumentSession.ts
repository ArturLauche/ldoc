import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createDocumentId,
  migrateLegacyDocumentToLibrary,
  upsertLibraryDocument,
  type StoredDocument,
} from '@/lib/documentLibrary';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import { t, type Locale } from '@/lib/translations';
import { saveDocumentVersion } from '@/lib/versionHistory';
import {
  readStorageItem,
  removeStorageItem,
  throwIfStorageFailed,
  writeStorageJson,
} from '@/lib/storage';

const AUTOSAVE_DELAY = 3000;

type CurrentDocumentRecord = {
  id?: string;
  content?: string;
  name?: string;
  savedAt?: string;
};

function parseCurrentDocument(raw: string): CurrentDocumentRecord | null {
  try {
    const parsed = JSON.parse(raw) as CurrentDocumentRecord;
    return typeof parsed.content === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function clearCurrentDocumentStorage() {
  removeStorageItem(STORAGE_KEY);
  removeStorageItem(LEGACY_STORAGE_KEY);
}

function writeCurrentDocumentStorage(doc: {
  id: string;
  name: string;
  content: string;
  savedAt: string;
}) {
  throwIfStorageFailed(writeStorageJson(STORAGE_KEY, doc));
}

export function useDocumentSession(editor: Editor | null, locale: Locale) {
  const [documentId, setDocumentId] = useState(() => createDocumentId());
  const [documentName, setDocumentName] = useState(() => t(locale, 'untitledDocument'));
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);

  const updateCounts = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharacterCount(text.length);
  }, [editor]);

  const saveSafetyVersion = useCallback(
    (suffix: string) => {
      if (!editor || !hasUnsavedChanges) return;

      try {
        saveDocumentVersion({
          documentId,
          name: `${documentName} ${suffix}`,
          content: editor.getHTML(),
        });
      } catch (error) {
        console.warn('Failed to save safety version:', error);
      }
    },
    [documentId, documentName, editor, hasUnsavedChanges],
  );

  const saveDocument = useCallback(
    (options?: { showToast?: boolean }) => {
      if (!editor) return;

      try {
        const content = editor.getHTML();
        const savedAt = new Date().toISOString();
        const savedDoc = upsertLibraryDocument({
          id: documentId,
          name: documentName,
          content,
          updatedAt: savedAt,
        });

        writeCurrentDocumentStorage({
          id: savedDoc.id,
          name: savedDoc.name,
          content: savedDoc.content,
          savedAt,
        });

        setDocumentId(savedDoc.id);
        setLastSaved(new Date(savedAt));
        setHasUnsavedChanges(false);

        if (options?.showToast) {
          toast.success(t(locale, 'saveSuccess'));
        }
      } catch (error) {
        console.error('Failed to save document:', error);
        setHasUnsavedChanges(true);
        toast.error(t(locale, 'saveFailed'));
      }
    },
    [documentId, documentName, editor, locale],
  );

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      setHasUnsavedChanges(true);
      updateCounts();
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, updateCounts]);

  useEffect(() => {
    if (!editor) return;

    migrateLegacyDocumentToLibrary();

    const current = readStorageItem(STORAGE_KEY);
    const legacy = readStorageItem(LEGACY_STORAGE_KEY);
    const raw = current.ok && current.value ? current.value : legacy.ok ? legacy.value : null;
    const doc = raw ? parseCurrentDocument(raw) : null;

    if (!doc?.content) {
      updateCounts();
      return;
    }

    editor.commands.setContent(sanitizeDocumentHtml(doc.content));
    setDocumentId(doc.id || createDocumentId());
    setDocumentName(doc.name || t(locale, 'untitledDocument'));
    setLastSaved(doc.savedAt ? new Date(doc.savedAt) : null);
    setHasUnsavedChanges(false);
    updateCounts();

    if (!current.ok || !current.value) {
      try {
        writeCurrentDocumentStorage({
          id: doc.id || createDocumentId(),
          name: doc.name || t(locale, 'untitledDocument'),
          content: sanitizeDocumentHtml(doc.content),
          savedAt: doc.savedAt || new Date().toISOString(),
        });
        removeStorageItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        console.warn('Failed to migrate current document storage:', error);
      }
    }
  }, [editor, locale, updateCounts]);

  useEffect(() => {
    if (!editor || !hasUnsavedChanges) return;

    const timer = window.setTimeout(() => {
      saveDocument();
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [editor, hasUnsavedChanges, saveDocument]);

  useEffect(() => {
    if (editor) {
      updateCounts();
    }
  }, [editor, updateCounts]);

  const createNewDocument = useCallback(() => {
    if (!editor) return;

    saveSafetyVersion('(before new document)');
    editor.commands.setContent('<p></p>');
    setDocumentId(createDocumentId());
    setDocumentName(t(locale, 'untitledDocument'));
    setLastSaved(null);
    setHasUnsavedChanges(false);
    clearCurrentDocumentStorage();
    updateCounts();
  }, [editor, locale, saveSafetyVersion, updateCounts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        saveDocument({ showToast: true });
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault();
        if (hasUnsavedChanges && !confirm(t(locale, 'unsavedConfirm'))) {
          return;
        }
        createNewDocument();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createNewDocument, hasUnsavedChanges, locale, saveDocument]);

  const loadDocument = useCallback(
    (doc: StoredDocument) => {
      if (!editor) return;

      saveSafetyVersion('(before opening document)');
      const sanitizedContent = sanitizeDocumentHtml(doc.content);
      editor.commands.setContent(sanitizedContent);
      setDocumentId(doc.id);
      setDocumentName(doc.name);
      setLastSaved(new Date(doc.updatedAt));
      setHasUnsavedChanges(false);
      try {
        writeCurrentDocumentStorage({
          id: doc.id,
          name: doc.name,
          content: sanitizedContent,
          savedAt: doc.updatedAt,
        });
      } catch (error) {
        console.warn('Failed to set current document after load:', error);
      }
      updateCounts();
    },
    [editor, saveSafetyVersion, updateCounts],
  );

  const renameDocument = useCallback((name: string) => {
    setDocumentName(name);
    setHasUnsavedChanges(true);
  }, []);

  const restoreVersion = useCallback(
    (content: string) => {
      if (!editor) return;

      editor.commands.setContent(sanitizeDocumentHtml(content));
      setHasUnsavedChanges(true);
      updateCounts();
    },
    [editor, updateCounts],
  );

  return {
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
  };
}
