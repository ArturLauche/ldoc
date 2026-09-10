import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';
import { assertDocumentSize } from './documentLimits';
import {
  DocumentStorageError,
  readStorageItem,
  throwIfStorageFailed,
  writeStorageJson,
} from './storage';

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

export function getLibraryDocuments(options?: { strict?: boolean }): StoredDocument[] {
  try {
    const raw = throwIfStorageFailed(readStorageItem(LIBRARY_STORAGE_KEY));
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
    if (options?.strict && libraryCache.invalid)
      throw new Error('The library contains invalid records.');
    return libraryCache.documents.map((doc) => ({ ...doc }));
  } catch (error) {
    if (options?.strict) {
      throw error instanceof DocumentStorageError
        ? error
        : new DocumentStorageError('invalid-data', error);
    }
    return [];
  }
}

/** Internal writes contain only records normalized on ingress or cache read. */
function setLibraryDocuments(documents: StoredDocument[]) {
  throwIfStorageFailed(writeStorageJson(LIBRARY_STORAGE_KEY, documents));
  libraryCache = {
    raw: JSON.stringify(documents),
    documents: documents.map((doc) => ({ ...doc })),
    invalid: false,
  };
}

export function getLibraryDocument(id: string): StoredDocument | null {
  return getLibraryDocuments().find((doc) => doc.id === id) ?? null;
}

export function upsertLibraryDocument(data: {
  id?: string;
  name: string;
  content: string;
  updatedAt?: string;
}): StoredDocument {
  const now =
    data.updatedAt && isValidDateString(data.updatedAt)
      ? new Date(data.updatedAt).toISOString()
      : new Date().toISOString();
  assertDocumentSize(data.content);
  const documents = getLibraryDocuments({ strict: true });
  const existing = data.id ? documents.find((doc) => doc.id === data.id) : undefined;

  const document: StoredDocument = {
    id: existing?.id ?? data.id ?? createDocumentId(),
    name: data.name.trim() || 'Untitled Document',
    content: sanitizeDocumentHtml(data.content),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const next = [document, ...documents.filter((doc) => doc.id !== document.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  setLibraryDocuments(next);
  return document;
}

export function renameLibraryDocument(id: string, name: string): StoredDocument {
  const documents = getLibraryDocuments({ strict: true });
  const existing = documents.find((doc) => doc.id === id);

  if (!existing) {
    throw new Error('Document not found');
  }

  const trimmedName = name.trim() || 'Untitled Document';
  const renamed: StoredDocument = {
    ...existing,
    name: trimmedName,
    updatedAt: new Date().toISOString(),
  };

  setLibraryDocuments(
    documents
      .map((doc) => (doc.id === id ? renamed : doc))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );

  return renamed;
}

export function duplicateLibraryDocument(id: string): StoredDocument {
  const existing = getLibraryDocument(id);

  if (!existing) {
    throw new Error('Document not found');
  }

  return upsertLibraryDocument({
    id: createDocumentId(),
    name: `${existing.name} Copy`,
    content: existing.content,
    updatedAt: new Date().toISOString(),
  });
}

export function deleteLibraryDocument(id: string): void {
  setLibraryDocuments(getLibraryDocuments({ strict: true }).filter((doc) => doc.id !== id));
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

export function exportUnifiedLibraryFile(): string {
  return exportLibraryDocumentsFile(getLibraryDocuments({ strict: true }));
}

export function importUnifiedLibraryFile(rawText: string): { imported: number; skipped: number } {
  const parsed = parseLibraryFile(rawText);

  const existing = getLibraryDocuments({ strict: true });
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
  setLibraryDocuments(merged);

  return { imported, skipped };
}

/**
 * Adds an imported document (from a .docx/.odt/.txt/... file) to the library as
 * a brand new entry so the currently open document is never overwritten.
 */
export function addImportedDocumentToLibrary(name: string, content: string): StoredDocument {
  return upsertLibraryDocument({
    id: createDocumentId(),
    name: name.trim() || 'Untitled Document',
    content: sanitizeDocumentHtml(content),
    updatedAt: new Date().toISOString(),
  });
}

export function importSingleLibraryDocument(rawText: string): StoredDocument {
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
