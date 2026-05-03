import { createDocumentId } from './documentLibrary';

export interface StoredVersion {
  id: string;
  documentId: string;
  content: string;
  timestamp: string;
  name: string;
}

const VERSION_STORAGE_KEY = 'lwrite-document-versions';
const MIGRATION_KEY = 'lwrite-document-versions-migrated';
const LEGACY_STORAGE_KEYS = ['lwrite-versions', 'floatwrite-versions'];
const MAX_VERSIONS_PER_DOCUMENT = 20;

function isStoredVersion(value: unknown): value is StoredVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as Record<string, unknown>;

  return (
    typeof version.id === 'string' &&
    typeof version.documentId === 'string' &&
    typeof version.content === 'string' &&
    typeof version.timestamp === 'string' &&
    typeof version.name === 'string'
  );
}

function readVersions(): StoredVersion[] {
  try {
    const raw = localStorage.getItem(VERSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredVersion);
  } catch {
    return [];
  }
}

function writeVersions(versions: StoredVersion[]) {
  localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(versions));
}

export function migrateLegacyVersionsToDocument(documentId: string) {
  if (localStorage.getItem(MIGRATION_KEY)) {
    return;
  }

  const legacyRaw = LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
  if (!legacyRaw) {
    localStorage.setItem(MIGRATION_KEY, 'true');
    return;
  }

  try {
    const parsed = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(MIGRATION_KEY, 'true');
      return;
    }

    const migrated = parsed
      .map((version): StoredVersion | null => {
        if (!version || typeof version !== 'object') return null;
        const legacy = version as Record<string, unknown>;
        if (
          typeof legacy.content !== 'string' ||
          typeof legacy.timestamp !== 'string' ||
          typeof legacy.name !== 'string'
        ) {
          return null;
        }

        return {
          id: typeof legacy.id === 'string' ? legacy.id : createDocumentId(),
          documentId,
          content: legacy.content,
          timestamp: legacy.timestamp,
          name: legacy.name,
        };
      })
      .filter(isStoredVersion);

    writeVersions([...migrated, ...readVersions()]);
    LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Leave invalid legacy data alone; the editor should keep working.
  } finally {
    localStorage.setItem(MIGRATION_KEY, 'true');
  }
}

export function getDocumentVersions(documentId: string): StoredVersion[] {
  migrateLegacyVersionsToDocument(documentId);
  return readVersions()
    .filter((version) => version.documentId === documentId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function saveDocumentVersion(data: {
  documentId: string;
  content: string;
  name: string;
}): StoredVersion {
  const version: StoredVersion = {
    id: createDocumentId(),
    documentId: data.documentId,
    content: data.content,
    name: data.name,
    timestamp: new Date().toISOString(),
  };

  const versions = readVersions();
  const otherDocuments = versions.filter((item) => item.documentId !== data.documentId);
  const currentDocument = [version, ...versions.filter((item) => item.documentId === data.documentId)]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_VERSIONS_PER_DOCUMENT);

  writeVersions([...currentDocument, ...otherDocuments]);
  return version;
}

export function deleteDocumentVersion(versionId: string): void {
  writeVersions(readVersions().filter((version) => version.id !== versionId));
}
