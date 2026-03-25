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

const MAX_DOCUMENT_NAME_LENGTH = 180;

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

function asValidIsoDate(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return fallback;
  return new Date(time).toISOString();
}

function normalizeDocument(input: StoredDocument): StoredDocument {
  const now = new Date().toISOString();
  const normalizedName = input.name.trim().slice(0, MAX_DOCUMENT_NAME_LENGTH) || 'Untitled Document';
  const createdAt = asValidIsoDate(input.createdAt, now);
  const updatedAt = asValidIsoDate(input.updatedAt, createdAt);
  return {
    id: input.id.trim() || createDocumentId(),
    name: normalizedName,
    content: input.content,
    createdAt,
    updatedAt,
  };
}

export function createDocumentId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getLibraryDocuments(): StoredDocument[] {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const dedupedById = new Map<string, StoredDocument>();
    parsed.filter(isStoredDocument).forEach((doc) => {
      const normalized = normalizeDocument(doc);
      const previous = dedupedById.get(normalized.id);
      if (!previous || previous.updatedAt < normalized.updatedAt) {
        dedupedById.set(normalized.id, normalized);
      }
    });
    return Array.from(dedupedById.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function setLibraryDocuments(documents: StoredDocument[]) {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(documents));
}

export function upsertLibraryDocument(data: {
  id?: string;
  name: string;
  content: string;
  updatedAt?: string;
}): StoredDocument {
  const now = asValidIsoDate(data.updatedAt, new Date().toISOString());
  const documents = getLibraryDocuments();
  const existing = data.id ? documents.find((doc) => doc.id === data.id) : undefined;

  const document = normalizeDocument({
    id: existing?.id ?? data.id ?? createDocumentId(),
    name: data.name,
    content: data.content,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  const next = [document, ...documents.filter((doc) => doc.id !== document.id)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );

  setLibraryDocuments(next);
  return document;
}

export function migrateLegacyDocumentToLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as {
      id?: string;
      name?: string;
      content?: string;
      savedAt?: string;
    };

    if (typeof parsed.content !== 'string') return;

    const migrated = upsertLibraryDocument({
      id: parsed.id,
      name: parsed.name || 'Untitled Document',
      content: parsed.content,
      updatedAt: parsed.savedAt,
    });

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: migrated.id,
        name: migrated.name,
        content: migrated.content,
        savedAt: migrated.updatedAt,
      }),
    );

    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore invalid local data
  }
}

export function exportUnifiedLibraryFile(): string {
  const payload: UnifiedLibraryFile = {
    format: 'lwrite-library',
    version: 1,
    exportedAt: new Date().toISOString(),
    documents: getLibraryDocuments(),
  };

  return JSON.stringify(payload, null, 2);
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
    if (!isStoredDocument(doc)) {
      skipped += 1;
      return;
    }

    const normalized = normalizeDocument(doc);
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
