import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import { toast } from 'sonner';
import {
  LEGACY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  DocumentConflictError,
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
  migrateLegacyVersionsToDocument,
  saveDocumentVersion,
} from '@/lib/versionHistory';
import { throwIfStorageFailed } from '@/lib/storage';
import { subscribeDocumentChanges, writeDocumentItem } from '@/lib/documentDatabase';
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
  loading: boolean;
  transitioning: boolean;
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
    loading: true,
    transitioning: false,
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
  const saveRef = useRef<(options?: SaveOptions) => Promise<boolean>>(async () => false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const revisionRef = useRef(0);
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

  const automaticVersion = useCallback(async () => {
    if (!editor || editor.isDestroyed) return;
    try {
      await considerAutomaticVersion({
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
    (options?: SaveOptions): Promise<boolean> => {
      const current = sessionRef.current;
      if (
        !editor ||
        editor.isDestroyed ||
        invalidStartupRef.current ||
        current.conflict ||
        current.loading ||
        current.transitioning
      )
        return Promise.resolve(false);
      // Capture before queuing: route unmount can destroy the view before the
      // transaction starts and releases the schema used for HTML serialization.
      const content = editor.getHTML();
      const revision = revisionRef.current;
      const task = saveQueue.current.then(async () => {
        if (sessionRef.current.document.id !== current.document.id || sessionRef.current.conflict)
          return false;
        try {
          const doc = await upsertLibraryDocument(
            {
              id: current.document.id,
              name: current.document.name,
              content,
            },
            { baseline: baselineRef.current, writeCurrent: true },
          );
          baselineRef.current = doc;
          if (editor.isDestroyed || sessionRef.current.document.id !== current.document.id)
            return true;
          const document = {
            id: doc.id,
            name: doc.name,
            content: doc.content,
            savedAt: doc.updatedAt,
          };
          // A completed write must not mark edits made while it was pending as saved.
          if (revision === revisionRef.current) {
            updateSession({ document, dirty: false, error: null });
            clearTimeout(saveTimer.current);
          } else {
            updateSession({
              document: {
                ...sessionRef.current.document,
                savedAt: doc.updatedAt,
              },
              error: null,
            });
          }
          if (!options?.quiet) void automaticVersion();
          if (options?.showToast && revision === revisionRef.current)
            toast.success(tRef.current('saveSuccess'));
          return true;
        } catch (error) {
          if (error instanceof DocumentConflictError) updateSession({ conflict: true });
          else {
            updateSession({ dirty: true, error: 'save' });
            if (!options?.quiet)
              toast.error(tRef.current('saveFailed'), {
                id: 'document-save-error',
              });
          }
          return false;
        }
      });
      saveQueue.current = task;
      return task;
    },
    [automaticVersion, editor, updateSession],
  );
  useLayoutEffect(() => {
    saveRef.current = saveDocument;
  }, [saveDocument]);

  const markEdited = useCallback(() => {
    revisionRef.current += 1;
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
    let cancelled = false;
    editor.setEditable(false, false);
    const load = async () => {
      const loaded = await readCurrentDocument(tRef.current('untitledDocument'));
      if (cancelled || editor.isDestroyed) return;
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
        baselineRef.current = (await getLibraryDocuments({ strict: true })).some(
          (doc) => doc.id === document.id,
        )
          ? document
          : null;
        if (cancelled || editor.isDestroyed) return;
        if (needsMigration) {
          // Current record + library commit together. Stable legacy ids also cover
          // a retry of a partial migration performed by an older app version.
          const migrated = await upsertLibraryDocument(
            { ...document, updatedAt: document.savedAt ?? undefined },
            { baseline: baselineRef.current, writeCurrent: true },
          );
          baselineRef.current = migrated;
          if (!cancelled)
            updateSession({
              document: { ...document, savedAt: migrated.updatedAt },
            });
        } else if (needsNormalization) throwIfStorageFailed(await writeCurrentDocument(document));
        if (source === LEGACY_STORAGE_KEY)
          throwIfStorageFailed(await writeDocumentItem(LEGACY_STORAGE_KEY, null));
        await migrateLegacyVersionsToDocument(document.id);
      } catch (error) {
        if (!cancelled)
          updateSession(
            error instanceof DocumentConflictError
              ? { conflict: true }
              : { error: 'save', dirty: true },
          );
      }
    };
    void load().finally(() => {
      if (!cancelled && !editor.isDestroyed) {
        editor.setEditable(true, false);
        updateSession({ loading: false });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [editor, updateSession]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const flushBeforeDestroy = () => {
      if (sessionRef.current.dirty) void saveRef.current({ quiet: true });
    };
    editor.on('update', markEdited);
    editor.on('destroy', flushBeforeDestroy);
    return () => {
      editor.off('update', markEdited);
      editor.off('destroy', flushBeforeDestroy);
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

  useEffect(
    () =>
      subscribeDocumentChanges([LIBRARY_STORAGE_KEY], () => {
        const current = sessionRef.current;
        const baseline = baselineRef.current;
        if (!baseline || current.loading || current.transitioning) return;
        void getLibraryDocuments({ strict: true }).then(
          (documents) => {
            // Ignore notifications overtaken by our own completed save/transition.
            if (baselineRef.current !== baseline) return;
            const latest = documents.find((doc) => doc.id === current.document.id);
            if (!latest || latest.content !== baseline.content || latest.name !== baseline.name) {
              clearTimers();
              updateSession({ conflict: true });
            }
          },
          () => updateSession({ error: 'save' }),
        );
      }),
    [clearTimers, updateSession],
  );

  const prepareReplacement = useCallback(
    async (suffix: string, alwaysConfirm = false): Promise<boolean> => {
      if (!editor || replacingRef.current || sessionRef.current.loading) return false;
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
        await saveQueue.current;
        updateSession({ transitioning: true });
        editor.setEditable(false, false);
        // Read the live draft after confirmation: edits may have arrived while open.
        if (!isTrivialVersionContent(editor.getHTML())) {
          await saveDocumentVersion({
            documentId: sessionRef.current.document.id,
            name: `${sessionRef.current.document.name} ${suffix}`,
            content: editor.getHTML(),
            kind: 'safety',
          });
        }
        return true;
      } catch {
        toast.error(tRef.current('safetyVersionFailed'));
        updateSession({ transitioning: false });
        if (!editor.isDestroyed) editor.setEditable(true, false);
        return false;
      } finally {
        // The caller keeps the editor locked through the actual replacement.
        if (!sessionRef.current.transitioning) replacingRef.current = false;
      }
    },
    [confirm, editor, updateSession],
  );

  const replaceDocument = useCallback(
    async (document: CurrentDocument, dirty: boolean): Promise<boolean> => {
      if (!editor || editor.isDestroyed) return false;
      try {
        const content = sanitizeDocumentHtml(document.content);
        const next = { ...document, content };
        // A failed storage write leaves the old editor and identity intact.
        throwIfStorageFailed(await writeCurrentDocument(next));
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
        await writeDocumentItem(LEGACY_STORAGE_KEY, null);
        firstUnsavedAtRef.current = Date.now();
        updateSession({ document: next, dirty, error: null, conflict: false });
        if (dirty) markEdited();
        return true;
      } catch {
        updateSession({ error: 'save' });
        toast.error(tRef.current('saveFailed'));
        return false;
      } finally {
        replacingRef.current = false;
        updateSession({ transitioning: false });
        if (!editor.isDestroyed) editor.setEditable(true, false);
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
      try {
        // Restoring within the same document remains undoable.
        editor.commands.setContent(sanitizeDocumentHtml(content));
        markEdited();
        return true;
      } finally {
        replacingRef.current = false;
        updateSession({ transitioning: false });
        if (!editor.isDestroyed) editor.setEditable(true, false);
      }
    },
    [editor, markEdited, prepareReplacement, updateSession],
  );

  const renameDocument = useCallback(
    (name: string) => {
      if (
        sessionRef.current.loading ||
        sessionRef.current.transitioning ||
        name === sessionRef.current.document.name
      )
        return;
      updateSession({ document: { ...sessionRef.current.document, name } });
      markEdited();
    },
    [markEdited, updateSession],
  );

  const saveConflictCopy = useCallback(async () => {
    if (sessionRef.current.loading || replacingRef.current) return false;
    await saveQueue.current;
    if (sessionRef.current.loading || replacingRef.current) return false;
    baselineRef.current = null;
    updateSession({
      document: {
        ...sessionRef.current.document,
        id: createDocumentId(),
        savedAt: null,
      },
      conflict: false,
      dirty: true,
    });
    return saveRef.current({ showToast: true });
  }, [updateSession]);

  const reloadExternalDocument = useCallback(async () => {
    try {
      const latest = (await getLibraryDocuments({ strict: true })).find(
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
    isLoading: session.loading,
    isTransitioning: session.transitioning,
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
