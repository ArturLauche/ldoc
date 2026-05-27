import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';
import {
  readStorageItem,
  readStorageJson,
  removeStorageItem,
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

interface CurrentDocumentRecord {
  id?: string;
  name?: string;
  content: string;
  savedAt?: string;
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
  if (!isValidDateString(value.createdAt) || !isValidDateString(value.updatedAt)) return null;

  return {
    id: value.id,
    name: value.name.trim() || 'Untitled Document',
    content: sanitizeDocumentHtml(value.content),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function createDocumentId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getLibraryDocuments(): StoredDocument[] {
  const result = readStorageJson<unknown[]>(
    LIBRARY_STORAGE_KEY,
    (value): value is unknown[] => Array.isArray(value),
  );

  if (!result.ok || !result.value) {
    return [];
  }

  return result.value
    .map(normalizeStoredDocument)
    .filter((document): document is StoredDocument => document !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function setLibraryDocuments(documents: StoredDocument[]) {
  const normalized = documents
    .map(normalizeStoredDocument)
    .filter((document): document is StoredDocument => document !== null);
  throwIfStorageFailed(writeStorageJson(LIBRARY_STORAGE_KEY, normalized));
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
  const now = data.updatedAt && isValidDateString(data.updatedAt) ? data.updatedAt : new Date().toISOString();
  const documents = getLibraryDocuments();
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
  const documents = getLibraryDocuments();
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
  setLibraryDocuments(getLibraryDocuments().filter((doc) => doc.id !== id));
}

export function migrateLegacyDocumentToLibrary() {
  const currentRaw = readStorageItem(STORAGE_KEY);
  const legacyRaw = readStorageItem(LEGACY_STORAGE_KEY);
  const raw = currentRaw.ok && currentRaw.value ? currentRaw.value : legacyRaw.ok ? legacyRaw.value : null;

  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<CurrentDocumentRecord>;
    if (typeof parsed.content !== 'string') return;

    const migrated = upsertLibraryDocument({
      id: parsed.id,
      name: parsed.name || 'Untitled Document',
      content: parsed.content,
      updatedAt: parsed.savedAt,
    });

    throwIfStorageFailed(writeStorageJson(
      STORAGE_KEY,
      {
        id: migrated.id,
        name: migrated.name,
        content: migrated.content,
        savedAt: migrated.updatedAt,
      },
    ));

    removeStorageItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore invalid local data
  }
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
  return exportLibraryDocumentsFile(getLibraryDocuments());
}

export function importUnifiedLibraryFile(rawText: string): { imported: number; skipped: number } {
  const parsed = JSON.parse(rawText) as UnifiedLibraryFile;
  if (
    parsed.format !== 'lwrite-library' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.documents)
  ) {
    throw new Error('Unsupported library format');
  }

  const existing = getLibraryDocuments();
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
    if (!previous || previous.updatedAt < normalized.updatedAt) {
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

export function importSingleLibraryDocument(rawText: string): StoredDocument {
  const parsed = JSON.parse(rawText) as UnifiedLibraryFile;
  if (
    parsed.format !== 'lwrite-library' ||
    parsed.version !== 1 ||
    !Array.isArray(parsed.documents) ||
    parsed.documents.length === 0
  ) {
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
