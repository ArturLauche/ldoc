import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import { toast } from 'sonner';
import {
  LEGACY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  createDocumentId,
  getLibraryDocuments,
  upsertLibraryDocument,
  type StoredDocument,
} from '@/lib/documentLibrary';
import {
  readCurrentDocument,
  writeCurrentDocument,
  type CurrentDocument,
} from '@/lib/currentDocument';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import {
  AUTO_VERSION_IDLE_MS,
  considerAutomaticVersion,
  isTrivialVersionContent,
  saveDocumentVersion,
} from '@/lib/versionHistory';
import { removeStorageItem, throwIfStorageFailed } from '@/lib/storage';
import { useLocale } from '@/hooks/useLocale';
import { useConfirm } from '@/hooks/useConfirm';
import { logWarning } from '@/lib/logger';
import { useDocumentStats } from './useDocumentStats';

export const AUTOSAVE_DELAY = 3000;

type Session = {
  document: CurrentDocument;
  dirty: boolean;
  error: 'save' | 'load' | null;
  conflict: boolean;
};
type SaveOptions = { showToast?: boolean; quiet?: boolean };

/** One owner for every document transition, including keyboard and file imports. */
export function useDocumentSession(editor: Editor | null) {
  const { t } = useLocale();
  const confirm = useConfirm();
  const [session, setSession] = useState<Session>(() => ({
    document: {
      id: createDocumentId(),
      name: t('untitledDocument'),
      content: '<p></p>',
      savedAt: null,
    },
    dirty: false,
    error: null,
    conflict: false,
  }));
  const sessionRef = useRef(session);
  const tRef = useRef(t);
  useLayoutEffect(() => {
    tRef.current = t;
  }, [t]);
  const baselineRef = useRef<Pick<StoredDocument, 'name' | 'content'> | null>(null);
  const invalidStartupRef = useRef(false);
  const [startedAt] = useState(() => Date.now());
  const lastEditAtRef = useRef(startedAt);
  const firstUnsavedAtRef = useRef(startedAt);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const versionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef<(options?: SaveOptions) => boolean>(() => false);
  const replacingRef = useRef(false);
  const stats = useDocumentStats(editor);

  const updateSession = useCallback((patch: Partial<Session>) => {
    sessionRef.current = { ...sessionRef.current, ...patch };
    setSession(sessionRef.current);
  }, []);

  const clearTimers = useCallback(() => {
    clearTimeout(saveTimer.current);
    clearTimeout(versionTimer.current);
  }, []);

  const automaticVersion = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    try {
      considerAutomaticVersion({
        documentId: sessionRef.current.document.id,
        content: editor.getHTML(),
        lastEditAt: lastEditAtRef.current,
        autoVersionLabel: tRef.current('versionAutomaticLabel'),
      });
    } catch (error) {
      logWarning('Automatic version could not be saved', error);
    }
  }, [editor]);

  const saveDocument = useCallback(
    (options?: SaveOptions): boolean => {
      if (!editor || editor.isDestroyed || invalidStartupRef.current) return false;
      const current = sessionRef.current;
      if (current.conflict) return false;
      try {
        // Check at write time as well as on storage events (which may be delayed).
        const latest = getLibraryDocuments({ strict: true }).find(
          (doc) => doc.id === current.document.id,
        );
        const baseline = baselineRef.current;
        if (
          (!latest && baseline) ||
          (latest &&
            (!baseline || latest.content !== baseline.content || latest.name !== baseline.name))
        ) {
          updateSession({ conflict: true });
          return false;
        }
        const savedAt = new Date().toISOString();
        const doc = upsertLibraryDocument({
          id: current.document.id,
          name: current.document.name,
          content: editor.getHTML(),
          updatedAt: savedAt,
        });
        // If the second write fails, the library is still a valid baseline for retry.
        baselineRef.current = doc;
        const document = { id: doc.id, name: doc.name, content: doc.content, savedAt };
        throwIfStorageFailed(writeCurrentDocument(document));
        updateSession({ document, dirty: false, error: null });
        clearTimeout(saveTimer.current);
        if (!options?.quiet) automaticVersion();
        if (options?.showToast) toast.success(tRef.current('saveSuccess'));
        return true;
      } catch {
        updateSession({ dirty: true, error: 'save' });
        if (!options?.quiet) toast.error(tRef.current('saveFailed'), { id: 'document-save-error' });
        return false;
      }
    },
    [automaticVersion, editor, updateSession],
  );
  useLayoutEffect(() => {
    saveRef.current = saveDocument;
  }, [saveDocument]);

  const markEdited = useCallback(() => {
    lastEditAtRef.current = Date.now();
    if (!sessionRef.current.dirty) {
      firstUnsavedAtRef.current = Date.now();
      updateSession({ dirty: true });
    }
    clearTimers();
    const delay = Math.min(
      AUTOSAVE_DELAY,
      Math.max(0, 15_000 - (Date.now() - firstUnsavedAtRef.current)),
    );
    saveTimer.current = setTimeout(() => saveRef.current(), delay);
    versionTimer.current = setTimeout(automaticVersion, AUTO_VERSION_IDLE_MS);
  }, [automaticVersion, clearTimers, updateSession]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const loaded = readCurrentDocument(tRef.current('untitledDocument'));
    if (!loaded.ok) {
      invalidStartupRef.current = true;
      updateSession({ error: 'load' });
      return;
    }
    if (!loaded.value) return;
    const { document, source, needsMigration, needsNormalization } = loaded.value;
    editor
      .chain()
      .setContent(document.content, { emitUpdate: false })
      .setMeta('addToHistory', false)
      .run();
    updateSession({ document, dirty: false });
    try {
      // An orphaned current record can be recovered into the library. Once a
      // library entry is known, its disappearance must instead be a conflict.
      baselineRef.current = getLibraryDocuments({ strict: true }).some(
        (doc) => doc.id === document.id,
      )
        ? document
        : null;
    } catch {
      updateSession({ error: 'save' });
    }
    if (needsMigration || needsNormalization) {
      try {
        // Keep legacy data until both the library and current record are durable.
        if (needsMigration) {
          baselineRef.current = upsertLibraryDocument({
            ...document,
            updatedAt: document.savedAt ?? undefined,
          });
        }
        throwIfStorageFailed(writeCurrentDocument(document));
        if (source === LEGACY_STORAGE_KEY) removeStorageItem(LEGACY_STORAGE_KEY);
      } catch {
        updateSession({ error: 'save', dirty: true });
      }
    }
  }, [editor, updateSession]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.on('update', markEdited);
    return () => {
      editor.off('update', markEdited);
    };
  }, [editor, markEdited]);

  useEffect(() => {
    const flush = () => {
      if (sessionRef.current.dirty) saveRef.current({ quiet: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flush();
      if (sessionRef.current.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      flush();
      clearTimers();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [clearTimers]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LIBRARY_STORAGE_KEY && event.key !== null) return;
      const current = sessionRef.current;
      const baseline = baselineRef.current;
      if (!baseline) return;
      try {
        const latest = getLibraryDocuments({ strict: true }).find(
          (doc) => doc.id === current.document.id,
        );
        if (!latest || latest.content !== baseline.content || latest.name !== baseline.name) {
          clearTimers();
          updateSession({ conflict: true });
        }
      } catch {
        updateSession({ error: 'save' });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [clearTimers, updateSession]);

  const prepareReplacement = useCallback(
    async (suffix: string, alwaysConfirm = false): Promise<boolean> => {
      if (!editor || replacingRef.current) return false;
      replacingRef.current = true;
      try {
        const current = sessionRef.current;
        if (current.dirty || invalidStartupRef.current || alwaysConfirm) {
          const confirmed = await confirm({
            title: tRef.current('unsavedConfirmTitle'),
            description: invalidStartupRef.current
              ? tRef.current('unreadableDraftConfirm')
              : tRef.current('discardUnsavedChanges'),
          });
          if (!confirmed || editor.isDestroyed) return false;
        }
        // Read the live draft after confirmation: edits may have arrived while open.
        if (!isTrivialVersionContent(editor.getHTML())) {
          saveDocumentVersion({
            documentId: sessionRef.current.document.id,
            name: `${sessionRef.current.document.name} ${suffix}`,
            content: editor.getHTML(),
            kind: 'safety',
          });
        }
        return true;
      } catch {
        toast.error(tRef.current('safetyVersionFailed'));
        return false;
      } finally {
        replacingRef.current = false;
      }
    },
    [confirm, editor],
  );

  const replaceDocument = useCallback(
    (document: CurrentDocument, dirty: boolean): boolean => {
      if (!editor || editor.isDestroyed) return false;
      try {
        const content = sanitizeDocumentHtml(document.content);
        const next = { ...document, content };
        // A failed storage write leaves the old editor and identity intact.
        throwIfStorageFailed(writeCurrentDocument(next));
        clearTimers();
        editor.commands.setContent(content, { emitUpdate: false });
        // Undo must never bring a previous document into the new document's id.
        editor.view.updateState(
          EditorState.create({
            schema: editor.schema,
            doc: editor.state.doc,
            plugins: editor.state.plugins,
          }),
        );
        editor.view.dispatch(editor.state.tr);
        baselineRef.current = dirty || !document.savedAt ? null : next;
        invalidStartupRef.current = false;
        removeStorageItem(LEGACY_STORAGE_KEY);
        firstUnsavedAtRef.current = Date.now();
        updateSession({ document: next, dirty, error: null, conflict: false });
        if (dirty) markEdited();
        return true;
      } catch {
        updateSession({ error: 'save' });
        toast.error(tRef.current('saveFailed'));
        return false;
      }
    },
    [clearTimers, editor, markEdited, updateSession],
  );

  const createNewDocument = useCallback(async () => {
    if (!(await prepareReplacement(tRef.current('versionBeforeNewDocumentSuffix')))) return false;
    return replaceDocument(
      {
        id: createDocumentId(),
        name: tRef.current('untitledDocument'),
        content: '<p></p>',
        savedAt: null,
      },
      false,
    );
  }, [prepareReplacement, replaceDocument]);

  const loadDocument = useCallback(
    async (doc: StoredDocument) => {
      if (!(await prepareReplacement(tRef.current('versionBeforeOpenSuffix')))) return false;
      return replaceDocument({ ...doc, savedAt: doc.updatedAt }, false);
    },
    [prepareReplacement, replaceDocument],
  );

  const importDocument = useCallback(
    async (content: string, name: string) => {
      if (!(await prepareReplacement(tRef.current('versionBeforeOpenSuffix')))) return false;
      return replaceDocument({ id: createDocumentId(), name, content, savedAt: null }, true);
    },
    [prepareReplacement, replaceDocument],
  );

  const restoreVersion = useCallback(
    async (content: string) => {
      if (!(await prepareReplacement(tRef.current('versionBeforeRestoreSuffix'), true)))
        return false;
      if (!editor) return false;
      // Restoring within the same document remains undoable.
      editor.commands.setContent(sanitizeDocumentHtml(content));
      markEdited();
      return true;
    },
    [editor, markEdited, prepareReplacement],
  );

  const renameDocument = useCallback(
    (name: string) => {
      if (name === sessionRef.current.document.name) return;
      updateSession({ document: { ...sessionRef.current.document, name } });
      markEdited();
    },
    [markEdited, updateSession],
  );

  const saveConflictCopy = useCallback(() => {
    baselineRef.current = null;
    updateSession({
      document: { ...sessionRef.current.document, id: createDocumentId(), savedAt: null },
      conflict: false,
      dirty: true,
    });
    return saveRef.current({ showToast: true });
  }, [updateSession]);

  const reloadExternalDocument = useCallback(async () => {
    try {
      const latest = getLibraryDocuments({ strict: true }).find(
        (doc) => doc.id === sessionRef.current.document.id,
      );
      if (latest) return loadDocument(latest);
      toast.error(tRef.current('externalDocumentMissing'));
    } catch {
      toast.error(tRef.current('saveFailed'));
    }
    return false;
  }, [loadDocument]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        document.querySelector('[role=dialog], [role=alertdialog]') ||
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey)
      )
        return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveRef.current({ showToast: true });
      } else if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void createNewDocument();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createNewDocument]);

  return {
    documentId: session.document.id,
    documentName: session.document.name,
    lastSaved: session.document.savedAt ? new Date(session.document.savedAt) : null,
    hasUnsavedChanges: session.dirty,
    saveError: session.error,
    hasExternalChanges: session.conflict,
    ...stats,
    saveDocument,
    loadDocument,
    createNewDocument,
    renameDocument,
    restoreVersion,
    importDocument,
    saveConflictCopy,
    reloadExternalDocument,
  };
}
