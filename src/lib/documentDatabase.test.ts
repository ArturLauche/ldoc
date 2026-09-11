import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { documentTransaction, readDocumentItem } from './documentDatabase';
import { failDocumentWrites, storedItem } from '@/test/documentStorage';
import {
  upsertLibraryDocument,
  getLibraryDocuments,
  STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  DocumentConflictError,
  createLibraryBackup,
} from './documentLibrary';
import { readCurrentDocument, writeCurrentDocument } from './currentDocument';
import { throwIfStorageFailed } from './storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('durable document transactions', () => {
  it('commits the current record and library atomically, including quota failures', async () => {
    const before = await upsertLibraryDocument(
      { id: 'draft', name: 'Draft', content: '<p>Before</p>' },
      { writeCurrent: true },
    );
    const failing = failDocumentWrites(LIBRARY_STORAGE_KEY);
    await expect(
      upsertLibraryDocument(
        { ...before, content: '<p>After</p>' },
        { baseline: before, writeCurrent: true },
      ),
    ).rejects.toMatchObject({ code: 'quota' });
    failing.mockRestore();
    expect(JSON.parse((await storedItem(STORAGE_KEY))!).content).toBe('<p>Before</p>');
    expect((await getLibraryDocuments())[0].content).toBe('<p>Before</p>');
  });

  it('allows only one competing save against the same baseline', async () => {
    const before = await upsertLibraryDocument(
      { id: 'draft', name: 'Draft', content: '<p>Before</p>' },
      { writeCurrent: true },
    );
    const results = await Promise.allSettled(
      ['One', 'Two'].map((text) =>
        upsertLibraryDocument(
          { ...before, content: `<p>${text}</p>` },
          { baseline: before, writeCurrent: true },
        ),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.reason).toBeInstanceOf(DocumentConflictError);
    const library = await getLibraryDocuments();
    expect(JSON.parse((await storedItem(STORAGE_KEY))!).content).toBe(library[0].content);
  });

  it('keeps the migration identity stable after an older app partially saved an id-less record', async () => {
    const raw = JSON.stringify({ name: 'Legacy', content: '<p>Recovered</p>' });
    localStorage.setItem(STORAGE_KEY, raw);
    const first = throwIfStorageFailed(await readCurrentDocument('Untitled'))!.document;
    await upsertLibraryDocument(first);
    const failing = failDocumentWrites(STORAGE_KEY);
    expect(await writeCurrentDocument(first)).toMatchObject({
      ok: false,
      code: 'quota',
    });
    failing.mockRestore();
    const retry = throwIfStorageFailed(await readCurrentDocument('Untitled'))!.document;
    expect(retry.id).toBe(first.id);
    await upsertLibraryDocument(retry, { writeCurrent: true });
    expect(await getLibraryDocuments()).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('does not fall back to empty storage when IndexedDB is unavailable', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    expect(await readDocumentItem(STORAGE_KEY)).toMatchObject({
      ok: false,
      code: 'unavailable',
    });
  });

  it('does not expose success from a put in an aborted transaction', async () => {
    const result = await documentTransaction(['first', 'second'], (records) => {
      records.set('first', 'written but uncommitted');
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(result).toMatchObject({ ok: false, code: 'quota' });
    expect(await storedItem('first')).toBeNull();
  });

  it('backs up both sides of a conflict even when all writes fail', async () => {
    const saved = await upsertLibraryDocument({
      id: 'draft',
      name: 'Draft',
      content: '<p>Other tab</p>',
    });
    failDocumentWrites();
    const backup = await createLibraryBackup(
      { ...saved, content: '<p onclick="bad()">My draft</p>' },
      '(unsaved copy)',
    );
    const documents = JSON.parse(backup.payload).documents;
    expect(documents).toHaveLength(2);
    expect(documents.map((doc: { content: string }) => doc.content)).toEqual([
      '<p>My draft</p>',
      '<p>Other tab</p>',
    ]);
    expect(documents[0].id).not.toBe(saved.id);
    expect(backup.includesDraft).toBe(true);
  });
});
