import { createDocumentId } from './documentLibrary';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';
import {
  readStorageItem,
  readStorageJson,
  removeStorageItem,
  throwIfStorageFailed,
  writeStorageItem,
  writeStorageJson,
} from './storage';

export type VersionKind = 'manual' | 'auto' | 'safety';

export interface StoredVersion {
  id: string;
  documentId: string;
  content: string;
  timestamp: string;
  name: string;
  /** Omitted on legacy snapshots; treat as manual. */
  kind?: VersionKind;
}

/**
 * Idle gap after the last edit before an automatic checkpoint is created.
 * Continuous edits are grouped into one session; a pause starts a new version
 * on the next consideration pass (Docs / Word Online style).
 */
export const AUTO_VERSION_IDLE_MS = 2 * 60 * 1000;

/**
 * While the user keeps editing without a long pause, still take a hard
 * checkpoint so long sessions keep recoverable intermediate states.
 */
export const AUTO_VERSION_PERIODIC_MS = 10 * 60 * 1000;

const VERSION_STORAGE_KEY = 'lwrite-document-versions';
const MIGRATION_KEY = 'lwrite-document-versions-migrated';
const LEGACY_STORAGE_KEYS = ['lwrite-versions', 'floatwrite-versions'];
const MAX_VERSIONS_PER_DOCUMENT = 20;

function isVersionKind(value: unknown): value is VersionKind {
  return value === 'manual' || value === 'auto' || value === 'safety';
}

function isStoredVersion(value: unknown): value is StoredVersion {
  if (!value || typeof value !== 'object') return false;
  const version = value as Record<string, unknown>;

  return (
    typeof version.id === 'string' &&
    typeof version.documentId === 'string' &&
    typeof version.content === 'string' &&
    typeof version.timestamp === 'string' &&
    typeof version.name === 'string' &&
    (version.kind === undefined || isVersionKind(version.kind))
  );
}

function readVersions(): StoredVersion[] {
  const result = readStorageJson<unknown[]>(
    VERSION_STORAGE_KEY,
    (value): value is unknown[] => Array.isArray(value),
  );

  if (!result.ok || !result.value) {
    return [];
  }

  return result.value.filter(isStoredVersion).map((version) => ({
    ...version,
    content: sanitizeDocumentHtml(version.content),
  }));
}

function writeVersions(versions: StoredVersion[]) {
  throwIfStorageFailed(writeStorageJson(VERSION_STORAGE_KEY, versions));
}

/** Empty or placeholder editor HTML should not create history noise. */
export function isTrivialVersionContent(html: string): boolean {
  const sanitized = sanitizeDocumentHtml(html).trim();
  if (!sanitized) return true;

  const text = sanitized
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length === 0;
}

export function migrateLegacyVersionsToDocument(documentId: string) {
  const migrationFlag = readStorageItem(MIGRATION_KEY);
  if (migrationFlag.ok && migrationFlag.value) {
    return;
  }

  const legacyRaw = LEGACY_STORAGE_KEYS
    .map((key) => readStorageItem(key))
    .find((result) => result.ok && !!result.value);

  if (!legacyRaw) {
    writeStorageItem(MIGRATION_KEY, 'true');
    return;
  }

  try {
    const parsed = JSON.parse(legacyRaw.ok ? legacyRaw.value ?? '[]' : '[]');
    if (!Array.isArray(parsed)) {
      writeStorageItem(MIGRATION_KEY, 'true');
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
          content: sanitizeDocumentHtml(legacy.content),
          timestamp: legacy.timestamp,
          name: legacy.name,
          kind: isVersionKind(legacy.kind) ? legacy.kind : 'manual',
        };
      })
      .filter(isStoredVersion);

    writeVersions([...migrated, ...readVersions()]);
    LEGACY_STORAGE_KEYS.forEach((key) => removeStorageItem(key));
  } catch {
    // Leave invalid legacy data alone; the editor should keep working.
  } finally {
    writeStorageItem(MIGRATION_KEY, 'true');
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
  kind?: VersionKind;
}): StoredVersion {
  const version: StoredVersion = {
    id: createDocumentId(),
    documentId: data.documentId,
    content: sanitizeDocumentHtml(data.content),
    name: data.name,
    timestamp: new Date().toISOString(),
    kind: data.kind ?? 'manual',
  };

  const versions = readVersions();
  const otherDocuments = versions.filter((item) => item.documentId !== data.documentId);
  const currentDocument = [version, ...versions.filter((item) => item.documentId === data.documentId)]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_VERSIONS_PER_DOCUMENT);

  writeVersions([...currentDocument, ...otherDocuments]);
  return version;
}

export type AutomaticVersionReason = 'baseline' | 'idle' | 'periodic';

export type ConsiderAutomaticVersionResult =
  | { saved: true; version: StoredVersion; reason: AutomaticVersionReason }
  | { saved: false; reason: 'unchanged' | 'trivial' | 'too-soon' };

/**
 * Decide whether the current document state should become an automatic version
 * history entry. Continuous edits wait for an idle pause or a periodic
 * checkpoint so the 20-slot budget stays meaningful.
 */
export function considerAutomaticVersion(data: {
  documentId: string;
  content: string;
  /** Epoch ms of the most recent editor update. */
  lastEditAt: number;
  now?: number;
  autoVersionLabel: string;
}): ConsiderAutomaticVersionResult {
  const now = data.now ?? Date.now();
  const content = sanitizeDocumentHtml(data.content);

  if (isTrivialVersionContent(content)) {
    return { saved: false, reason: 'trivial' };
  }

  const versions = getDocumentVersions(data.documentId);
  const latest = versions[0];

  if (latest && latest.content === content) {
    return { saved: false, reason: 'unchanged' };
  }

  const idleMs = Math.max(0, now - data.lastEditAt);
  const sinceLastVersion = latest
    ? Math.max(0, now - new Date(latest.timestamp).getTime())
    : Number.POSITIVE_INFINITY;

  const saveAuto = (reason: AutomaticVersionReason): ConsiderAutomaticVersionResult => {
    const version = saveDocumentVersion({
      documentId: data.documentId,
      content,
      name: data.autoVersionLabel,
      kind: 'auto',
    });
    return { saved: true, version, reason };
  };

  // First meaningful snapshot for this document.
  if (!latest) {
    return saveAuto('baseline');
  }

  // After an editing pause, capture the settled session state.
  if (idleMs >= AUTO_VERSION_IDLE_MS) {
    return saveAuto('idle');
  }

  // Long continuous session: force a checkpoint so intermediate work remains
  // recoverable even without a pause.
  if (sinceLastVersion >= AUTO_VERSION_PERIODIC_MS) {
    return saveAuto('periodic');
  }

  return { saved: false, reason: 'too-soon' };
}

export function deleteDocumentVersion(versionId: string): void {
  writeVersions(readVersions().filter((version) => version.id !== versionId));
}
