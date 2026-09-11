import {
  detectStorageError,
  readStorageItem,
  throwIfStorageFailed,
  type DocumentStorageResult,
} from './storage';

export const DOCUMENT_DATABASE_NAME = 'lwrite';
const STORE = 'documents';
const CHANNEL = 'lwrite-document-changes';

export interface DocumentRecords {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

/**
 * Read/modify/write under one native transaction, including legacy ingress.
 * The callback must be synchronous: IndexedDB commits between event-loop tasks.
 * Resolve only on transaction completion, never on an individual put's success.
 */
export async function documentTransaction<T>(
  keys: readonly string[],
  update: (records: DocumentRecords) => T,
  options?: { readonly?: boolean },
): Promise<DocumentStorageResult<T>> {
  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DOCUMENT_DATABASE_NAME, 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Close other LWrite tabs to update document storage.'));
      };
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
    });
    return await new Promise<DocumentStorageResult<T>>((resolve) => {
      const transaction = database.transaction(STORE, options?.readonly ? 'readonly' : 'readwrite');
      const objectStore = transaction.objectStore(STORE);
      const values = new Map<string, string | null>();
      const changes = new Set<string>();
      const uniqueKeys = [...new Set(keys)];
      let result: T;
      let failure: unknown;
      const fail = (error: unknown) => {
        failure = error;
        transaction.abort();
      };
      const run = () => {
        try {
          result = update({
            get(key) {
              if (!values.has(key)) throw new Error(`Undeclared document key: ${key}`);
              return values.get(key) ?? null;
            },
            set(key, value) {
              if (options?.readonly) throw new Error('Cannot write in a read-only transaction.');
              if (!values.has(key)) throw new Error(`Undeclared document key: ${key}`);
              if (values.get(key) === value) return;
              changes.add(key);
              values.set(key, value);
              // A null tombstone prevents old localStorage data from reappearing.
              objectStore.put(value, key);
            },
          });
        } catch (error) {
          fail(error);
        }
      };
      transaction.oncomplete = () => {
        database.close();
        try {
          if (changes.size && typeof window.BroadcastChannel === 'function') {
            const channel = new window.BroadcastChannel(CHANNEL);
            try {
              channel.postMessage([...changes]);
            } finally {
              channel.close();
            }
          }
        } catch {
          /* Focus checks and atomic save baselines still detect conflicts. */
        }
        resolve({ ok: true, value: result });
      };
      transaction.onabort = () => {
        database.close();
        resolve(detectStorageError(failure ?? transaction.error));
      };
      for (const key of uniqueKeys) {
        const request = objectStore.get(key);
        request.onsuccess = () => {
          try {
            const stored: unknown = request.result;
            if (stored !== undefined && stored !== null && typeof stored !== 'string')
              throw new Error('Invalid document storage record.');
            // Preserve the original localStorage records as recovery sources.
            // Once copied, IndexedDB is authoritative, including absent records.
            const value =
              stored === undefined ? throwIfStorageFailed(readStorageItem(key)) : stored;
            values.set(key, value);
            if (stored === undefined && !options?.readonly) objectStore.put(value, key);
            if (values.size === uniqueKeys.length) run();
          } catch (error) {
            fail(error);
          }
        };
      }
      if (!uniqueKeys.length) run();
    });
  } catch (error) {
    return detectStorageError(error);
  }
}

export function readDocumentItem(key: string): Promise<DocumentStorageResult<string | null>> {
  // Reading/backing up a legacy library must still work when writes hit quota.
  return documentTransaction([key], (records) => records.get(key), {
    readonly: true,
  });
}

export function writeDocumentItem(
  key: string,
  value: string | null,
): Promise<DocumentStorageResult<void>> {
  return documentTransaction([key], (records) => records.set(key, value));
}

/** Notifications are hints; every save also checks its baseline atomically. */
export function subscribeDocumentChanges(
  keys: readonly string[],
  listener: () => void,
): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof window.BroadcastChannel === 'function')
      channel = new window.BroadcastChannel(CHANNEL);
  } catch {
    /* The browser may disable this optional notification API. */
  }
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (
        Array.isArray(event.data) &&
        event.data.some((key) => typeof key === 'string' && keys.includes(key))
      )
        listener();
    };
  window.addEventListener('focus', listener);
  window.addEventListener('storage', listener);
  return () => {
    channel?.close();
    window.removeEventListener('focus', listener);
    window.removeEventListener('storage', listener);
  };
}
