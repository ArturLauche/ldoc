import * as library from '@/lib/documentLibrary';
import { setImmediate } from 'node:timers';
import { failDocumentWrites, storedItem, storeItem } from '@/test/documentStorage';
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
async function setup() {
  editor = new Editor({
    extensions: createEditorExtensions(() => ''),
    content: '<p></p>',
  });
  const hook = renderHook(() => useDocumentSession(editor), {
    wrapper: LocaleProvider,
  });
  unmount = hook.unmount;
  while (hook.result.current.isLoading) {
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
  }
  return hook.result;
}
async function seed() {
  const doc = await upsertLibraryDocument({
    id: 'draft',
    name: 'Draft',
    content: '<p>Original</p>',
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...doc, savedAt: doc.updatedAt }));
  return doc;
}

beforeEach(() => {
  localStorage.clear();
  confirm.mockResolvedValue(true);
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
  unmount?.();
  unmount = undefined;
  editor?.destroy();
  await new Promise<void>((resolve) => setImmediate(resolve));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('document session safety', () => {
  it('debounces from the latest edit and saves the latest body and name', async () => {
    const result = await setup();
    await act(async () => {
      editor.commands.setContent('<p>First</p>');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      editor.commands.setContent('<p>Latest</p>');
      result.current.renameDocument('Latest title');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await storedItem(STORAGE_KEY)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
      await storedItem(STORAGE_KEY);
    });
    expect(JSON.parse((await storedItem(STORAGE_KEY))!)).toMatchObject({
      name: 'Latest title',
      content: '<p>Latest</p>',
    });
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('flushes the live draft on pagehide before the debounce elapses', async () => {
    const result = await setup();
    await act(async () => {
      editor.commands.setContent('<p>Last keystroke</p>');
      window.dispatchEvent(new Event('pagehide'));
      await result.current.saveDocument({ quiet: true });
    });
    expect((await getLibraryDocuments())[0].content).toBe('<p>Last keystroke</p>');
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('keeps a failed save dirty and requests browser confirmation on exit', async () => {
    const result = await setup();
    failDocumentWrites();
    const event = new Event('beforeunload', { cancelable: true });
    await act(async () => {
      editor.commands.setContent('<p>Keep me</p>');
      window.dispatchEvent(event);
      await result.current.saveDocument({ quiet: true });
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.saveError).toBe('save');
  });

  it('does not overwrite a malformed startup record when typing or autosaving', async () => {
    const raw = JSON.stringify({ content: '<p>Recover me</p>', name: 42 });
    localStorage.setItem(STORAGE_KEY, raw);
    const result = await setup();
    await act(async () => {
      editor.commands.setContent('<p>New text</p>');
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY);
    });
    expect(result.current.saveError).toBe('load');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('aborts replacement when its safety snapshot cannot be stored', async () => {
    await seed();
    const result = await setup();
    failDocumentWrites('lwrite-document-versions');
    let replaced: boolean | undefined;
    await act(async () => {
      replaced = await result.current.createNewDocument();
    });
    expect(replaced).toBe(false);
    expect(editor.getText()).toBe('Original');
    expect(result.current.documentId).toBe('draft');
  });

  it('checks replacement permission after import conversion and preserves a canceled draft', async () => {
    const result = await setup();
    await act(async () => {
      editor.commands.setContent('<p>Unsaved</p>');
    });
    confirm.mockResolvedValue(false);
    await act(async () => {
      expect(await result.current.importDocument('<p>Imported</p>', 'Import')).toBe(false);
    });
    expect(editor.getText()).toBe('Unsaved');
  });

  it('creates a safety version and resets undo history when opening another document', async () => {
    await seed();
    const result = await setup();
    await act(async () => {
      editor.commands.setContent('<p>Unsaved old document</p>');
    });
    const next = await upsertLibraryDocument({
      id: 'next',
      name: 'Next',
      content: '<p>Next body</p>',
    });
    await act(async () => {
      expect(await result.current.loadDocument(next)).toBe(true);
    });
    expect(editor.can().undo()).toBe(false);
    expect(editor.getText()).toBe('Next body');
    expect((await getDocumentVersions('draft'))[0].content).toBe('<p>Unsaved old document</p>');
  });

  it('keeps the current document when persisting the opened record fails', async () => {
    const result = await setup();
    const next = await upsertLibraryDocument({
      id: 'next',
      name: 'Next',
      content: '<p>Next body</p>',
    });
    const id = result.current.documentId;
    failDocumentWrites(STORAGE_KEY);
    await act(async () => {
      expect(await result.current.loadDocument(next)).toBe(false);
    });
    expect(result.current.documentId).toBe(id);
    expect(result.current.saveError).toBe('save');
  });

  it('detects another tab at write time and saves local edits under a fresh id', async () => {
    await seed();
    const result = await setup();
    await act(async () => {
      editor.commands.setContent('<p>My edits</p>');
    });
    await upsertLibraryDocument({
      id: 'draft',
      name: 'Draft',
      content: '<p>Other tab</p>',
    });
    await act(async () => {
      expect(await result.current.saveDocument()).toBe(false);
    });
    expect(result.current.hasExternalChanges).toBe(true);
    expect((await getLibraryDocuments()).find((doc) => doc.id === 'draft')?.content).toBe(
      '<p>Other tab</p>',
    );
    await act(async () => {
      expect(await result.current.saveConflictCopy()).toBe(true);
    });
    expect(result.current.documentId).not.toBe('draft');
    expect((await getLibraryDocuments()).map((doc) => doc.content)).toEqual(
      expect.arrayContaining(['<p>Other tab</p>', '<p>My edits</p>']),
    );
  });

  it('detects deletion by another tab without silently resurrecting the document', async () => {
    await seed();
    const result = await setup();
    await storeItem(LIBRARY_STORAGE_KEY, '[]');
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: LIBRARY_STORAGE_KEY,
          newValue: '[]',
        }),
      );
      await getLibraryDocuments();
    });
    expect(result.current.hasExternalChanges).toBe(true);
    await act(async () => {
      expect(await result.current.saveDocument()).toBe(false);
    });
    expect(await getLibraryDocuments()).toEqual([]);
  });

  it('detects deletion at write time before a storage event is delivered', async () => {
    await seed();
    const result = await setup();
    await storeItem(LIBRARY_STORAGE_KEY, '[]');
    await act(async () => {
      editor.commands.insertContent(' local edit');
      expect(await result.current.saveDocument()).toBe(false);
    });
    expect(result.current.hasExternalChanges).toBe(true);
    expect(await getLibraryDocuments()).toEqual([]);
  });

  it('recovers a startup draft that has no library entry', async () => {
    await seed();
    await storeItem(LIBRARY_STORAGE_KEY, null);
    const result = await setup();
    await act(async () => {
      expect(await result.current.saveDocument()).toBe(true);
    });
    expect((await getLibraryDocuments())[0]).toMatchObject({
      id: 'draft',
      content: '<p>Original</p>',
    });
    expect(result.current.hasExternalChanges).toBe(false);
  });
});

it('saves during continuous typing without waiting indefinitely for idle time', async () => {
  const result = await setup();
  await act(async () => {
    editor.commands.setContent('<p>Start</p>');
  });
  for (let i = 1; i <= 7; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      editor.commands.insertContent(' more');
    });
  }
  expect(await storedItem(STORAGE_KEY)).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
    await storedItem(STORAGE_KEY);
  });
  expect(JSON.parse((await storedItem(STORAGE_KEY))!)).toMatchObject({
    content: editor.getHTML(),
  });
  expect(result.current.hasUnsavedChanges).toBe(false);
});

it('keeps the restored startup document outside undo history', async () => {
  await seed();
  await setup();
  expect(editor.can().undo()).toBe(false);
  await act(async () => {
    editor.commands.insertContent(' edit');
    editor.commands.undo();
  });
  expect(editor.getText()).toBe('Original');
});

it('keeps edits made during a pending write dirty until the next save', async () => {
  const result = await setup();
  const original = library.upsertLibraryDocument;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(library, 'upsertLibraryDocument').mockImplementationOnce(async (...args) => {
    await gate;
    return original(...args);
  });
  let pending: Promise<boolean>;
  await act(async () => {
    editor.commands.setContent('<p>First snapshot</p>');
    pending = result.current.saveDocument({ quiet: true });
  });
  await act(async () => {
    editor.commands.setContent('<p>Typed during the save</p>');
    release();
    await pending;
  });
  expect(result.current.hasUnsavedChanges).toBe(true);
  expect((await getLibraryDocuments())[0].content).toBe('<p>First snapshot</p>');
  await act(async () => {
    await result.current.saveDocument({ quiet: true });
  });
  expect(result.current.hasUnsavedChanges).toBe(false);
  expect((await getLibraryDocuments())[0].content).toBe('<p>Typed during the save</p>');
});

it('captures the draft before an editor destroy releases its schema', async () => {
  await setup();
  await act(async () => {
    editor.commands.setContent('<p>Before destroy</p>');
    editor.destroy();
    await storedItem(STORAGE_KEY);
  });
  expect((await getLibraryDocuments())[0].content).toBe('<p>Before destroy</p>');
});


it('does not mark startup or document replacement dirty when editability changes', async () => {
  const result = await setup();
  expect(result.current.hasUnsavedChanges).toBe(false);
  await act(async () => { expect(await result.current.createNewDocument()).toBe(true); });
  expect(result.current.hasUnsavedChanges).toBe(false);
});
