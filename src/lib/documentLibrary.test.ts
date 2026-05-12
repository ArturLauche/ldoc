import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIBRARY_STORAGE_KEY,
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

  it('upserts sanitized documents sorted by updated date', () => {
    const older = upsertLibraryDocument({
      id: 'older',
      name: 'Older',
      content: '<p>old</p>',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const newer = upsertLibraryDocument({
      id: 'newer',
      name: 'Newer',
      content: '<p onclick="alert(1)">safe</p><script>alert(1)</script>',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(getLibraryDocuments().map((doc) => doc.id)).toEqual([newer.id, older.id]);
    expect(getLibraryDocuments()[0].content).toBe('<p>safe</p>');
  });

  it('exports, imports, duplicates, and deletes documents', () => {
    const doc = upsertLibraryDocument({
      id: 'doc-1',
      name: 'Source',
      content: '<p>Hello</p>',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const exported = exportLibraryDocumentsFile([doc]);
    localStorage.clear();
    expect(importUnifiedLibraryFile(exported)).toEqual({ imported: 1, skipped: 0 });
    expect(getLibraryDocuments()).toHaveLength(1);

    const duplicate = duplicateLibraryDocument(doc.id);
    expect(duplicate.id).not.toBe(doc.id);
    expect(duplicate.name).toBe('Source Copy');

    deleteLibraryDocument(doc.id);
    expect(getLibraryDocuments().map((item) => item.id)).toEqual([duplicate.id]);
  });

  it('imports a single library document with a fresh id', () => {
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

    const imported = importSingleLibraryDocument(exported);
    expect(imported.id).not.toBe('incoming');
    expect(getLibraryDocuments()).toHaveLength(1);
  });

  it('ignores invalid persisted library data', () => {
    localStorage.setItem(LIBRARY_STORAGE_KEY, '{"not":"an array"}');
    expect(getLibraryDocuments()).toEqual([]);
  });
});

