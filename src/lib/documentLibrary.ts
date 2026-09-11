import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';
import { assertDocumentSize } from './documentLimits';
import { DocumentStorageError, throwIfStorageFailed } from './storage';
import { documentTransaction, readDocumentItem, type DocumentRecords } from './documentDatabase';

export const STORAGE_KEY = 'lwrite-current-doc';
export const LEGACY_STORAGE_KEY = 'floatwrite-current-doc';
export const LIBRARY_STORAGE_KEY = 'lwrite-doc-library';

export interface StoredDocument {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface UnifiedLibraryFile {
  format: 'lwrite-library';
  version: 1;
  exportedAt: string;
  documents: StoredDocument[];
}

function isStoredDocument(value: unknown): value is StoredDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.id === 'string' &&
    typeof doc.name === 'string' &&
    typeof doc.content === 'string' &&
    typeof doc.createdAt === 'string' &&
    typeof doc.updatedAt === 'string'
  );
}

function isValidDateString(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function normalizeStoredDocument(value: unknown): StoredDocument | null {
  if (!isStoredDocument(value)) return null;
  if (!value.id.trim()) return null;
  if (!isValidDateString(value.createdAt) || !isValidDateString(value.updatedAt)) return null;

  return {
    id: value.id,
    name: value.name.trim() || 'Untitled Document',
    content: sanitizeDocumentHtml(value.content),
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
  };
}

export function createDocumentId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// One bounded cache, keyed by the actual stored string. Reads from another tab
// invalidate it immediately. Return copies so callers cannot poison the cache.
let libraryCache: { raw: string | null; documents: StoredDocument[]; invalid: boolean } | undefined;

export function parseLibraryDocuments(raw: string | null, strict = false): StoredDocument[] {
  try {
    if (!libraryCache || libraryCache.raw !== raw) {
      const parsed: unknown = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Invalid document library.');
      const normalized = parsed.map(normalizeStoredDocument);
      const documents = normalized.filter((doc): doc is StoredDocument => doc !== null);
      libraryCache = {
        raw,
        documents: documents.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
        invalid:
          documents.length !== parsed.length ||
          new Set(documents.map((doc) => doc.id)).size !== documents.length,
      };
    }
    if (strict && libraryCache.invalid) throw new Error('The library contains invalid records.');
    return libraryCache.documents.map((doc) => ({ ...doc }));
  } catch (error) {
    if (strict) throw new DocumentStorageError('invalid-data', error);
    return [];
  }
}

export async function getLibraryDocuments(options?: {
  strict?: boolean;
}): Promise<StoredDocument[]> {
  const result = await readDocumentItem(LIBRARY_STORAGE_KEY);
  if (!result.ok) {
    if (options?.strict) throwIfStorageFailed(result);
    return [];
  }
  return parseLibraryDocuments(result.value, options?.strict);
}

function updateLibrary<T>(
  update: (documents: StoredDocument[], records: DocumentRecords) => T,
  keys: string[] = [],
) {
  return documentTransaction([LIBRARY_STORAGE_KEY, ...keys], (records) => {
    const documents = parseLibraryDocuments(records.get(LIBRARY_STORAGE_KEY), true);
    const result = update(documents, records);
    records.set(
      LIBRARY_STORAGE_KEY,
      JSON.stringify(documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    );
    return result;
  }).then(throwIfStorageFailed);
}

export class DocumentConflictError extends Error {
  constructor() {
    super('This document changed in another tab.');
  }
}

export async function getLibraryDocument(id: string): Promise<StoredDocument | null> {
  return (await getLibraryDocuments()).find((doc) => doc.id === id) ?? null;
}

export function upsertLibraryDocument(
  data: {
    id?: string;
    name: string;
    content: string;
    updatedAt?: string;
  },
  options?: {
    baseline?: Pick<StoredDocument, 'name' | 'content'> | null;
    writeCurrent?: boolean;
  },
): Promise<StoredDocument> {
  const now =
    data.updatedAt && isValidDateString(data.updatedAt)
      ? new Date(data.updatedAt).toISOString()
      : new Date().toISOString();
  assertDocumentSize(data.content);
  const content = sanitizeDocumentHtml(data.content);
  return updateLibrary(
    (documents, records) => {
      const existing = data.id ? documents.find((doc) => doc.id === data.id) : undefined;
      if (options && 'baseline' in options) {
        const baseline = options.baseline;
        if (
          (!existing && baseline) ||
          (existing &&
            (!baseline || existing.content !== baseline.content || existing.name !== baseline.name))
        ) {
          // Return a conflict without changing either record.
          return null;
        }
      }
      const document: StoredDocument = {
        id: existing?.id ?? data.id ?? createDocumentId(),
        name: data.name.trim() || 'Untitled Document',
        content,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const index = documents.findIndex((doc) => doc.id === document.id);
      if (index < 0) documents.push(document);
      else documents[index] = document;
      if (options?.writeCurrent) {
        records.set(
          STORAGE_KEY,
          JSON.stringify({
            id: document.id,
            name: document.name,
            content,
            savedAt: now,
          }),
        );
      }
      return document;
    },
    options?.writeCurrent ? [STORAGE_KEY] : [],
  ).then((document) => {
    if (!document) throw new DocumentConflictError();
    return document;
  });
}

export function renameLibraryDocument(id: string, name: string): Promise<StoredDocument> {
  return updateLibrary((documents) => {
    const existing = documents.find((doc) => doc.id === id);
    if (!existing) throw new Error('Document not found');
    existing.name = name.trim() || 'Untitled Document';
    existing.updatedAt = new Date().toISOString();
    return existing;
  });
}

export function duplicateLibraryDocument(id: string): Promise<StoredDocument> {
  return updateLibrary((documents) => {
    const existing = documents.find((doc) => doc.id === id);
    if (!existing) throw new Error('Document not found');
    const now = new Date().toISOString();
    const duplicate = {
      ...existing,
      id: createDocumentId(),
      name: `${existing.name} Copy`,
      createdAt: now,
      updatedAt: now,
    };
    documents.push(duplicate);
    return duplicate;
  });
}

export function deleteLibraryDocument(id: string): Promise<void> {
  return updateLibrary((documents) => {
    const index = documents.findIndex((doc) => doc.id === id);
    if (index >= 0) documents.splice(index, 1);
  });
}

export function exportLibraryDocumentsFile(documents: StoredDocument[]): string {
  const safeDocuments = documents
    .map(normalizeStoredDocument)
    .filter((document): document is StoredDocument => document !== null);
  const payload: UnifiedLibraryFile = {
    format: 'lwrite-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    documents: safeDocuments,
  };

  return JSON.stringify(payload, null, 2);
}

export async function exportUnifiedLibraryFile(): Promise<string> {
  return exportLibraryDocumentsFile(await getLibraryDocuments({ strict: true }));
}

export function importUnifiedLibraryFile(
  rawText: string,
): Promise<{ imported: number; skipped: number }> {
  const parsed = parseLibraryFile(rawText);

  return updateLibrary((existing) => {
    const byId = new Map(existing.map((doc) => [doc.id, doc]));

    let imported = 0;
    let skipped = 0;

    parsed.documents.forEach((doc) => {
      const normalized = normalizeStoredDocument(doc);
      if (!normalized) {
        skipped += 1;
        return;
      }

      const previous = byId.get(normalized.id);
      if (!previous || Date.parse(previous.updatedAt) < Date.parse(normalized.updatedAt)) {
        byId.set(normalized.id, normalized);
        imported += 1;
      } else {
        skipped += 1;
      }
    });

    const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    existing.splice(0, existing.length, ...merged);

    return { imported, skipped };
  });
}

/**
 * Adds an imported document (from a .docx/.odt/.txt/... file) to the library as
 * a brand new entry so the currently open document is never overwritten.
 */
export function addImportedDocumentToLibrary(
  name: string,
  content: string,
): Promise<StoredDocument> {
  return upsertLibraryDocument({
    id: createDocumentId(),
    name: name.trim() || 'Untitled Document',
    content: sanitizeDocumentHtml(content),
    updatedAt: new Date().toISOString(),
  });
}

export function importSingleLibraryDocument(rawText: string): Promise<StoredDocument> {
  const parsed = parseLibraryFile(rawText);
  if (parsed.documents.length === 0) {
    throw new Error('Invalid or empty document file');
  }

  const doc = parsed.documents[0];
  const normalized = normalizeStoredDocument(doc);
  if (!normalized) {
    throw new Error('Invalid document data');
  }

  return upsertLibraryDocument({
    id: createDocumentId(),
    name: normalized.name,
    content: normalized.content,
    updatedAt: new Date().toISOString(),
  });
}

function parseLibraryFile(rawText: string): { documents: unknown[] } {
  assertDocumentSize(rawText);
  const parsed: unknown = JSON.parse(rawText);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid library file.');
  const value = parsed as Record<string, unknown>;
  if (value.format !== 'lwrite-library' || value.version !== 1 || !Array.isArray(value.documents)) {
    throw new Error('Unsupported library format.');
  }
  return { documents: value.documents };
}

/** A backup never depends on a successful save and never replaces a conflicting saved copy. */
export async function createLibraryBackup(
  draft: Pick<StoredDocument, 'id' | 'name' | 'content'>,
  draftSuffix: string,
) {
  const documents = await getLibraryDocuments({ strict: true });
  const content = sanitizeDocumentHtml(draft.content);
  const existing = documents.find((doc) => doc.id === draft.id);
  const includesDraft = !existing || existing.content !== content || existing.name !== draft.name;
  if (includesDraft) {
    const now = new Date().toISOString();
    documents.unshift({
      id: existing ? createDocumentId() : draft.id,
      name: existing ? `${draft.name} ${draftSuffix}` : draft.name,
      content,
      createdAt: now,
      updatedAt: now,
    });
  }
  return {
    payload: exportLibraryDocumentsFile(documents),
    count: documents.length,
    includesDraft,
  };
}
