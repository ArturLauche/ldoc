import { storeItem } from '@/test/documentStorage';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIBRARY_STORAGE_KEY,
  addImportedDocumentToLibrary,
  deleteLibraryDocument,
  duplicateLibraryDocument,
  exportLibraryDocumentsFile,
  getLibraryDocuments,
  importSingleLibraryDocument,
  importUnifiedLibraryFile,
  upsertLibraryDocument,
} from './documentLibrary';

describe('documentLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('upserts sanitized documents sorted by updated date', async () => {
    const older = await upsertLibraryDocument({
      id: 'older',
      name: 'Older',
      content: '<p>old</p>',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = await upsertLibraryDocument({
      id: 'newer',
      name: 'Newer',
      content: '<p onclick="alert(1)">safe</p><script>alert(1)</script>',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect((await getLibraryDocuments()).map((doc) => doc.id)).toEqual([newer.id, older.id]);
    expect((await getLibraryDocuments())[0].content).toBe('<p>safe</p>');
  });

  it('exports, imports, duplicates, and deletes documents', async () => {
    const doc = await upsertLibraryDocument({
      id: 'doc-1',
      name: 'Source',
      content: '<p>Hello</p>',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const exported = exportLibraryDocumentsFile([doc]);
    await storeItem(LIBRARY_STORAGE_KEY, null);
    expect(await importUnifiedLibraryFile(exported)).toEqual({
      imported: 1,
      skipped: 0,
    });
    expect(await getLibraryDocuments()).toHaveLength(1);

    const duplicate = await duplicateLibraryDocument(doc.id);
    expect(duplicate.id).not.toBe(doc.id);
    expect(duplicate.name).toBe('Source Copy');

    await deleteLibraryDocument(doc.id);
    expect((await getLibraryDocuments()).map((item) => item.id)).toEqual([duplicate.id]);
  });

  it('imports a single library document with a fresh id', async () => {
    const exported = JSON.stringify({
      format: 'lwrite-library',
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      documents: [
        {
          id: 'incoming',
          name: 'Incoming',
          content: '<p>Imported</p>',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const imported = await importSingleLibraryDocument(exported);
    expect(imported.id).not.toBe('incoming');
    expect(await getLibraryDocuments()).toHaveLength(1);
  });

  it('ignores invalid persisted library data', async () => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, '{"not":"an array"}');
    expect(await getLibraryDocuments()).toEqual([]);
  });

  it('sanitizes raw persisted documents when reading and exporting backups', async () => {
    localStorage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'raw',
          name: 'Raw',
          content: '<p onclick="alert(1)">Safe</p><script>alert(1)</script>',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'invalid-date',
          name: 'Invalid',
          content: '<p>Invalid</p>',
          createdAt: 'not a date',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]),
    );

    const documents = await getLibraryDocuments();
    expect(documents).toHaveLength(1);
    expect(documents[0].content).toBe('<p>Safe</p>');

    const exported = exportLibraryDocumentsFile([
      {
        id: 'unsafe',
        name: 'Unsafe',
        content: '<img src="javascript:alert(1)" onerror="alert(1)">',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);

    expect(exported).not.toContain('javascript:');
    expect(exported).not.toContain('onerror');
  });
  it('adds imported files as new sanitized library documents', async () => {
    const doc = await addImportedDocumentToLibrary(
      '  Imported Report  ',
      '<p onclick="alert(1)">Hello</p>',
    );

    expect(doc.name).toBe('Imported Report');
    expect(doc.content).toBe('<p>Hello</p>');
    expect((await getLibraryDocuments()).some((entry) => entry.id === doc.id)).toBe(true);
  });
});

it('does not overwrite an unreadable library during mutations', async () => {
  const raw = '{broken';
  localStorage.setItem(LIBRARY_STORAGE_KEY, raw);
  await expect(upsertLibraryDocument({ name: 'New', content: '<p>New</p>' })).rejects.toThrow();
  expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe(raw);
  localStorage.clear();
});

it('invalidates cached documents after external writes and protects the cache from callers', async () => {
  localStorage.clear();
  const first = await upsertLibraryDocument({
    name: 'First',
    content: '<p>Safe</p>',
  });
  const documents = await getLibraryDocuments();
  documents[0].content = '<script>unsafe</script>';
  expect((await getLibraryDocuments())[0].content).toBe('<p>Safe</p>');
  await storeItem(
    LIBRARY_STORAGE_KEY,
    JSON.stringify([{ ...first, name: 'Other tab', content: '<p onclick="x()">Changed</p>' }]),
  );
  expect((await getLibraryDocuments())[0]).toMatchObject({
    name: 'Other tab',
    content: '<p>Changed</p>',
  });
  localStorage.clear();
});

it.each(['null', '[]', '{}', '{"format":"lwrite-library","version":2,"documents":[]}'])(
  'rejects malformed library envelopes: %s',
  async (raw) => {
    await expect(async () => importUnifiedLibraryFile(raw)).rejects.toThrow();
  },
);
