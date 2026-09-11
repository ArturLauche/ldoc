import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './documentLibrary';
import { assertDocumentSize } from './documentLimits';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';
import { type DocumentStorageResult } from './storage';
import { readDocumentItem, writeDocumentItem } from './documentDatabase';

export interface CurrentDocument {
  id: string;
  name: string;
  content: string;
  savedAt: string | null;
}

export interface LoadedCurrentDocument {
  document: CurrentDocument;
  source: string;
  needsMigration: boolean;
  needsNormalization: boolean;
}

export async function readCurrentDocument(
  defaultName: string,
): Promise<DocumentStorageResult<LoadedCurrentDocument | null>> {
  for (const source of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    const raw = await readDocumentItem(source);
    if (!raw.ok) return raw;
    if (raw.value === null) continue;
    try {
      const value: unknown = JSON.parse(raw.value);
      if (!value || typeof value !== 'object') throw new Error('Invalid document record.');
      const record = value as Record<string, unknown>;
      if (
        typeof record.content !== 'string' ||
        (record.id !== undefined && typeof record.id !== 'string') ||
        (record.name !== undefined && typeof record.name !== 'string') ||
        (record.savedAt != null &&
          (typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))))
      ) {
        throw new Error('Invalid document fields.');
      }
      assertDocumentSize(record.content);
      const content = sanitizeDocumentHtml(record.content);
      const id =
        typeof record.id === 'string' && record.id.trim()
          ? record.id
          : await legacyDocumentId(source, raw.value);
      return {
        ok: true,
        value: {
          document: {
            id,
            name: typeof record.name === 'string' && record.name.trim() ? record.name : defaultName,
            content,
            savedAt:
              typeof record.savedAt === 'string' ? new Date(record.savedAt).toISOString() : null,
          },
          source,
          needsMigration: source === LEGACY_STORAGE_KEY || id !== record.id,
          needsNormalization: content !== record.content,
        },
      };
    } catch (error) {
      // Never silently replace a malformed draft with an empty document.
      return { ok: false, code: 'invalid-data', error };
    }
  }
  return { ok: true, value: null };
}

export async function writeCurrentDocument(
  document: CurrentDocument,
): Promise<DocumentStorageResult<void>> {
  try {
    assertDocumentSize(document.content);
    return writeDocumentItem(
      STORAGE_KEY,
      JSON.stringify({
        ...document,
        content: sanitizeDocumentHtml(document.content),
      }),
    );
  } catch (error) {
    return { ok: false, code: 'invalid-data', error };
  }
}

async function legacyDocumentId(source: string, raw: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${source}\n${raw}`),
  );
  return `legacy-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
