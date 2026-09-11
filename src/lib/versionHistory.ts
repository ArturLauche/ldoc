import { createDocumentId } from './documentLibrary';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';
import { assertDocumentSize } from './documentLimits';
import { DocumentStorageError, throwIfStorageFailed } from './storage';
import { documentTransaction, type DocumentRecords } from './documentDatabase';

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
    version.id.trim().length > 0 &&
    version.documentId.trim().length > 0 &&
    Number.isFinite(Date.parse(version.timestamp)) &&
    (version.kind === undefined || isVersionKind(version.kind))
  );
}

function readVersions(records: DocumentRecords, strict = false): StoredVersion[] {
  try {
    const raw = records.get(VERSION_STORAGE_KEY);
    const value: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Invalid version history.');
    if (strict && !value.every(isStoredVersion)) throw new Error('Invalid version history.');
    const versions = value.filter(isStoredVersion);
    if (strict && new Set(versions.map((version) => version.id)).size !== versions.length)
      throw new Error('Duplicate version ids.');
    return versions.map((version) => ({
      ...version,
      content: sanitizeDocumentHtml(version.content),
      timestamp: new Date(version.timestamp).toISOString(),
    }));
  } catch (error) {
    if (strict) throw new DocumentStorageError('invalid-data', error);
    return [];
  }
}

function writeVersions(records: DocumentRecords, versions: StoredVersion[]) {
  records.set(VERSION_STORAGE_KEY, JSON.stringify(versions));
}

/** Empty or placeholder editor HTML should not create history noise. */
export function isTrivialVersionContent(html: string): boolean {
  const sanitized = sanitizeDocumentHtml(html).trim();
  if (!sanitized) return true;
  if (/<(?:img|table|hr)\b|data-lwrite-graphic=/i.test(sanitized)) return false;

  const text = sanitized
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.length === 0;
}

export function migrateLegacyVersionsToDocument(documentId: string): Promise<void> {
  return documentTransaction(
    [VERSION_STORAGE_KEY, MIGRATION_KEY, ...LEGACY_STORAGE_KEYS],
    (records) => {
      if (records.get(MIGRATION_KEY)) return;

      const migrated: StoredVersion[] = [];
      for (const key of LEGACY_STORAGE_KEYS) {
        const raw = records.get(key);
        if (!raw) continue;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed))
          throw new DocumentStorageError('invalid-data', new Error('Invalid legacy history.'));
        for (const [index, value] of parsed.entries()) {
          const legacy = value as Record<string, unknown> | null;
          if (
            !legacy ||
            typeof legacy.content !== 'string' ||
            typeof legacy.timestamp !== 'string' ||
            typeof legacy.name !== 'string' ||
            !Number.isFinite(Date.parse(legacy.timestamp))
          ) {
            throw new DocumentStorageError('invalid-data', new Error('Invalid legacy version.'));
          }
          assertDocumentSize(legacy.content);
          migrated.push({
            // Stable fallback ids make a retry after a partial write idempotent.
            id:
              typeof legacy.id === 'string' && legacy.id.trim()
                ? legacy.id
                : `legacy-${key}-${index}`,
            documentId,
            content: sanitizeDocumentHtml(legacy.content),
            timestamp: new Date(legacy.timestamp).toISOString(),
            name: legacy.name,
            kind: isVersionKind(legacy.kind) ? legacy.kind : 'manual',
          });
        }
      }
      if (migrated.length) {
        const existing = readVersions(records, true);
        const byId = new Map<string, StoredVersion>();
        for (const version of [
          ...migrated,
          ...existing.filter((item) => item.documentId === documentId),
        ]) {
          const previous = byId.get(version.id);
          if (!previous || Date.parse(previous.timestamp) <= Date.parse(version.timestamp))
            byId.set(version.id, version);
        }
        const current = [...byId.values()]
          .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
          .slice(0, MAX_VERSIONS_PER_DOCUMENT);
        writeVersions(records, [
          ...existing.filter((version) => version.documentId !== documentId),
          ...current,
        ]);
      }
      // A failure leaves source records intact and migration pending for retry.
      records.set(MIGRATION_KEY, 'true');
      LEGACY_STORAGE_KEYS.forEach((key) => records.set(key, null));
    },
  ).then(throwIfStorageFailed);
}

/** Reads are side-effect free at the repository level; migration runs on session load. */
export async function getDocumentVersions(
  documentId: string,
  options?: { strict?: boolean },
): Promise<StoredVersion[]> {
  const result = await documentTransaction(
    [VERSION_STORAGE_KEY],
    (records) =>
      readVersions(records, options?.strict)
        .filter((version) => version.documentId === documentId)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    { readonly: true },
  );
  if (!result.ok && !options?.strict) return [];
  return throwIfStorageFailed(result);
}

type VersionData = {
  documentId: string;
  content: string;
  name: string;
  kind?: VersionKind;
};

function saveVersion(records: DocumentRecords, data: VersionData): StoredVersion {
  assertDocumentSize(data.content);
  const version: StoredVersion = {
    id: createDocumentId(),
    documentId: data.documentId,
    content: sanitizeDocumentHtml(data.content),
    name: data.name,
    timestamp: new Date().toISOString(),
    kind: data.kind ?? 'manual',
  };

  const versions = readVersions(records, true);
  const otherDocuments = versions.filter((item) => item.documentId !== data.documentId);
  const currentDocument = [
    version,
    ...versions.filter((item) => item.documentId === data.documentId),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_VERSIONS_PER_DOCUMENT);

  writeVersions(records, [...currentDocument, ...otherDocuments]);
  return version;
}

export function saveDocumentVersion(data: VersionData): Promise<StoredVersion> {
  return documentTransaction([VERSION_STORAGE_KEY], (records) => saveVersion(records, data)).then(
    throwIfStorageFailed,
  );
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
}): Promise<ConsiderAutomaticVersionResult> {
  return documentTransaction([VERSION_STORAGE_KEY], (records): ConsiderAutomaticVersionResult => {
    const now = data.now ?? Date.now();
    const content = sanitizeDocumentHtml(data.content);

    if (isTrivialVersionContent(content)) {
      return { saved: false, reason: 'trivial' };
    }

    const versions = readVersions(records, true)
      .filter((version) => version.documentId === data.documentId)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const latest = versions[0];

    if (latest && latest.content === content) {
      return { saved: false, reason: 'unchanged' };
    }

    const idleMs = Math.max(0, now - data.lastEditAt);
    const sinceLastVersion = latest
      ? Math.max(0, now - new Date(latest.timestamp).getTime())
      : Number.POSITIVE_INFINITY;

    const saveAuto = (reason: AutomaticVersionReason): ConsiderAutomaticVersionResult => {
      const version = saveVersion(records, {
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
  }).then(throwIfStorageFailed);
}

export function deleteDocumentVersion(versionId: string): Promise<void> {
  return documentTransaction([VERSION_STORAGE_KEY], (records) =>
    writeVersions(
      records,
      readVersions(records, true).filter((version) => version.id !== versionId),
    ),
  ).then(throwIfStorageFailed);
}
