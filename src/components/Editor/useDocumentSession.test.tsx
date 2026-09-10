import { act, renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import {
  LIBRARY_STORAGE_KEY,
  STORAGE_KEY,
  getLibraryDocuments,
  upsertLibraryDocument,
} from '@/lib/documentLibrary';
import { getDocumentVersions } from '@/lib/versionHistory';
import { createEditorExtensions } from './editorExtensions';
import { AUTOSAVE_DELAY, useDocumentSession } from './useDocumentSession';

const confirm = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock('@/hooks/useConfirm', () => ({ useConfirm: () => confirm }));

let editor: Editor;
let unmount: (() => void) | undefined;
function setup() {
  editor = new Editor({ extensions: createEditorExtensions(() => ''), content: '<p></p>' });
  const hook = renderHook(() => useDocumentSession(editor), { wrapper: LocaleProvider });
  unmount = hook.unmount;
  return hook.result;
}
function seed() {
  const doc = upsertLibraryDocument({ id: 'draft', name: 'Draft', content: '<p>Original</p>' });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...doc, savedAt: doc.updatedAt }));
  return doc;
}

beforeEach(() => {
  localStorage.clear();
  confirm.mockResolvedValue(true);
  vi.useFakeTimers();
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  editor?.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('document session safety', () => {
  it('debounces from the latest edit and saves the latest body and name', () => {
    const result = setup();
    act(() => {
      editor.commands.setContent('<p>First</p>');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
      editor.commands.setContent('<p>Latest</p>');
      result.current.renameDocument('Latest title');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY);
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      name: 'Latest title',
      content: '<p>Latest</p>',
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('flushes the live draft on pagehide before the debounce elapses', () => {
    const result = setup();
    act(() => {
      editor.commands.setContent('<p>Last keystroke</p>');
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(getLibraryDocuments()[0].content).toBe('<p>Last keystroke</p>');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('keeps a failed save dirty and requests browser confirmation on exit', () => {
    const result = setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    const event = new Event('beforeunload', { cancelable: true });
    act(() => {
      editor.commands.setContent('<p>Keep me</p>');
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.saveError).toBe('save');
  });

  it('does not overwrite a malformed startup record when typing or autosaving', () => {
    const raw = JSON.stringify({ content: '<p>Recover me</p>', name: 42 });
    localStorage.setItem(STORAGE_KEY, raw);
    const result = setup();
    act(() => {
      editor.commands.setContent('<p>New text</p>');
      vi.advanceTimersByTime(AUTOSAVE_DELAY);
    });
    expect(result.current.saveError).toBe('load');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('aborts replacement when its safety snapshot cannot be stored', async () => {
    seed();
    const result = setup();
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'lwrite-document-versions') throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    let replaced: boolean | undefined;
    await act(async () => {
      replaced = await result.current.createNewDocument();
    });
    expect(replaced).toBe(false);
    expect(editor.getText()).toBe('Original');
    expect(result.current.documentId).toBe('draft');
  });

  it('checks replacement permission after import conversion and preserves a canceled draft', async () => {
    const result = setup();
    act(() => {
      editor.commands.setContent('<p>Unsaved</p>');
    });
    confirm.mockResolvedValue(false);
    await act(async () => {
      expect(await result.current.importDocument('<p>Imported</p>', 'Import')).toBe(false);
    });
    expect(editor.getText()).toBe('Unsaved');
  });

  it('creates a safety version and resets undo history when opening another document', async () => {
    seed();
    const result = setup();
    act(() => {
      editor.commands.setContent('<p>Unsaved old document</p>');
    });
    const next = upsertLibraryDocument({ id: 'next', name: 'Next', content: '<p>Next body</p>' });
    await act(async () => {
      expect(await result.current.loadDocument(next)).toBe(true);
    });
    expect(editor.can().undo()).toBe(false);
    expect(editor.getText()).toBe('Next body');
    expect(getDocumentVersions('draft')[0].content).toBe('<p>Unsaved old document</p>');
  });

  it('keeps the current document when persisting the opened record fails', async () => {
    const result = setup();
    const next = upsertLibraryDocument({ id: 'next', name: 'Next', content: '<p>Next body</p>' });
    const id = result.current.documentId;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === STORAGE_KEY) throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    await act(async () => {
      expect(await result.current.loadDocument(next)).toBe(false);
    });
    expect(result.current.documentId).toBe(id);
    expect(result.current.saveError).toBe('save');
  });

  it('detects another tab at write time and saves local edits under a fresh id', () => {
    seed();
    const result = setup();
    act(() => {
      editor.commands.setContent('<p>My edits</p>');
    });
    upsertLibraryDocument({ id: 'draft', name: 'Draft', content: '<p>Other tab</p>' });
    act(() => {
      expect(result.current.saveDocument()).toBe(false);
    });
    expect(result.current.hasExternalChanges).toBe(true);
    expect(getLibraryDocuments().find((doc) => doc.id === 'draft')?.content).toBe(
      '<p>Other tab</p>',
    );
    act(() => {
      expect(result.current.saveConflictCopy()).toBe(true);
    });
    expect(result.current.documentId).not.toBe('draft');
    expect(getLibraryDocuments().map((doc) => doc.content)).toEqual(
      expect.arrayContaining(['<p>Other tab</p>', '<p>My edits</p>']),
    );
  });

  it('detects deletion by another tab without silently resurrecting the document', () => {
    seed();
    const result = setup();
    localStorage.setItem(LIBRARY_STORAGE_KEY, '[]');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: LIBRARY_STORAGE_KEY, newValue: '[]' }),
      );
    });
    expect(result.current.hasExternalChanges).toBe(true);
    act(() => {
      expect(result.current.saveDocument()).toBe(false);
    });
    expect(getLibraryDocuments()).toEqual([]);
  });

  it('detects deletion at write time before a storage event is delivered', () => {
    seed();
    const result = setup();
    localStorage.setItem(LIBRARY_STORAGE_KEY, '[]');
    act(() => {
      editor.commands.insertContent(' local edit');
      expect(result.current.saveDocument()).toBe(false);
    });
    expect(result.current.hasExternalChanges).toBe(true);
    expect(getLibraryDocuments()).toEqual([]);
  });

  it('recovers a startup draft that has no library entry', () => {
    seed();
    localStorage.removeItem(LIBRARY_STORAGE_KEY);
    const result = setup();
    act(() => {
      expect(result.current.saveDocument()).toBe(true);
    });
    expect(getLibraryDocuments()[0]).toMatchObject({ id: 'draft', content: '<p>Original</p>' });
    expect(result.current.hasExternalChanges).toBe(false);
  });
});

it('saves during continuous typing without waiting indefinitely for idle time', () => {
  const result = setup();
  act(() => {
    editor.commands.setContent('<p>Start</p>');
  });
  for (let i = 1; i <= 7; i += 1) {
    act(() => {
      vi.advanceTimersByTime(2000);
      editor.commands.insertContent(' more');
    });
  }
  expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
    content: editor.getHTML(),
  });
  expect(result.current.hasUnsavedChanges).toBe(false);
});

it('keeps the restored startup document outside undo history', () => {
  seed();
  setup();
  expect(editor.can().undo()).toBe(false);
  act(() => {
    editor.commands.insertContent(' edit');
    editor.commands.undo();
  });
  expect(editor.getText()).toBe('Original');
});
