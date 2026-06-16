import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { toast } from 'sonner';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  createDocumentId,
  upsertLibraryDocument,
  type StoredDocument,
} from '@/lib/documentLibrary';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import { saveDocumentVersion } from '@/lib/versionHistory';
import {
  readStorageItem,
  removeStorageItem,
  throwIfStorageFailed,
  writeStorageJson,
} from '@/lib/storage';
import { useLocale } from '@/components/locale-provider';
import { useConfirm } from '@/components/confirm-provider';

const AUTOSAVE_DELAY = 3000;

type CurrentDocumentRecord = {
  id?: string;
  content?: string;
  name?: string;
  savedAt?: string;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
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

function scheduleIdleTask(callback: () => void): () => void {
  const idleWindow = window as IdleWindow;

  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 1500 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timeout = window.setTimeout(callback, 0);
  return () => window.clearTimeout(timeout);
}

export function useDocumentSession(editor: Editor | null) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const [documentId, setDocumentId] = useState(() => createDocumentId());
  const [documentName, setDocumentName] = useState(() => t('untitledDocument'));
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);

  // The startup-load effect must not re-run when the locale changes (it would
  // clobber unsaved edits), so it reads translations through a ref.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

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
          toast.success(t('saveSuccess'));
        }
      } catch (error) {
        console.error('Failed to save document:', error);
        setHasUnsavedChanges(true);
        toast.error(t('saveFailed'));
      }
    },
    [documentId, documentName, editor, t],
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

    const current = readStorageItem(STORAGE_KEY);
    const legacy = readStorageItem(LEGACY_STORAGE_KEY);
    let source: 'current' | 'legacy' | null = null;
    let raw: string | null = null;

    if (current.ok && current.value) {
      source = 'current';
      raw = current.value;
    } else if (legacy.ok && legacy.value) {
      source = 'legacy';
      raw = legacy.value;
    }

    const doc = raw ? parseCurrentDocument(raw) : null;

    if (!doc?.content) {
      return scheduleIdleTask(updateCounts);
    }

    const sanitizedContent = sanitizeDocumentHtml(doc.content);
    const nextDocumentId = doc.id || createDocumentId();
    const nextDocumentName = doc.name || tRef.current('untitledDocument');
    const nextSavedAt = doc.savedAt || new Date().toISOString();
    const shouldMigrateCurrentDocument = source === 'legacy' || !doc.id;
    const shouldNormalizeCurrentStorage = source === 'current' && sanitizedContent !== doc.content;

    editor.commands.setContent(sanitizedContent, { emitUpdate: false });
    setDocumentId(nextDocumentId);
    setDocumentName(nextDocumentName);
    setLastSaved(doc.savedAt ? new Date(doc.savedAt) : null);
    setHasUnsavedChanges(false);

    const cancelCountRefresh = scheduleIdleTask(updateCounts);
    let cancelLibraryMigration: (() => void) | undefined;

    if (shouldMigrateCurrentDocument || shouldNormalizeCurrentStorage) {
      try {
        writeCurrentDocumentStorage({
          id: nextDocumentId,
          name: nextDocumentName,
          content: sanitizedContent,
          savedAt: nextSavedAt,
        });
        if (source === 'legacy') {
          removeStorageItem(LEGACY_STORAGE_KEY);
        }
      } catch (error) {
        console.warn('Failed to migrate current document storage:', error);
      }
    }

    if (shouldMigrateCurrentDocument) {
      cancelLibraryMigration = scheduleIdleTask(() => {
        try {
          upsertLibraryDocument({
            id: nextDocumentId,
            name: nextDocumentName,
            content: sanitizedContent,
            updatedAt: nextSavedAt,
          });
        } catch (error) {
          console.warn('Failed to seed migrated document library:', error);
        }
      });
    }

    return () => {
      cancelCountRefresh();
      cancelLibraryMigration?.();
    };
  }, [editor, updateCounts]);

  useEffect(() => {
    if (!editor || !hasUnsavedChanges) return;

    const timer = window.setTimeout(() => {
      saveDocument();
    }, AUTOSAVE_DELAY);

    return () => window.clearTimeout(timer);
  }, [editor, hasUnsavedChanges, saveDocument]);

  // Flush a pending autosave when the editor unmounts — for example when the
  // user clicks a footer link to a legal page within the autosave debounce
  // window. Without this, the cleanup above clears the timer and the recent
  // edits would be lost on the next load. A ref keeps the latest closure so the
  // unmount-only effect always sees current state.
  const flushPendingSaveRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushPendingSaveRef.current = () => {
      if (hasUnsavedChanges) saveDocument();
    };
  }, [hasUnsavedChanges, saveDocument]);
  useEffect(() => () => flushPendingSaveRef.current(), []);

  useEffect(() => {
    if (editor) {
      updateCounts();
    }
  }, [editor, updateCounts]);

  const createNewDocument = useCallback(() => {
    if (!editor) return;

    saveSafetyVersion(t('versionBeforeNewDocumentSuffix'));
    editor.commands.setContent('<p></p>');
    setDocumentId(createDocumentId());
    setDocumentName(t('untitledDocument'));
    setLastSaved(null);
    setHasUnsavedChanges(false);
    clearCurrentDocumentStorage();
    updateCounts();
  }, [editor, saveSafetyVersion, t, updateCounts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        saveDocument({ showToast: true });
      }

      if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault();
        void (async () => {
          if (hasUnsavedChanges) {
            const confirmed = await confirm({
              title: t('unsavedConfirmTitle'),
              description: t('unsavedConfirm'),
            });
            if (!confirmed) return;
          }
          createNewDocument();
        })();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirm, createNewDocument, hasUnsavedChanges, saveDocument, t]);

  const loadDocument = useCallback(
    (doc: StoredDocument) => {
      if (!editor) return;

      saveSafetyVersion(t('versionBeforeOpenSuffix'));
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
    [editor, saveSafetyVersion, t, updateCounts],
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
