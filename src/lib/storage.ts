export type DocumentStorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'quota' | 'unavailable' | 'invalid-data'; error: unknown };

export class DocumentStorageError extends Error {
  constructor(
    public readonly code: Exclude<DocumentStorageResult<never>, { ok: true }>['code'],
    public readonly cause: unknown,
  ) {
    super(`Document storage failed: ${code}`);
    this.name = 'DocumentStorageError';
  }
}

function storageUnavailable(error: unknown): DocumentStorageResult<never> {
  return { ok: false, code: 'unavailable', error };
}

function detectStorageError(error: unknown): DocumentStorageResult<never> {
  if (error instanceof DOMException) {
    if (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    ) {
      return { ok: false, code: 'quota', error };
    }
  }

  return storageUnavailable(error);
}

export function getLocalStorage(): DocumentStorageResult<Storage> {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return storageUnavailable(new Error('localStorage is not available.'));
    }

    return { ok: true, value: window.localStorage };
  } catch (error) {
    return storageUnavailable(error);
  }
}

export function readStorageItem(key: string): DocumentStorageResult<string | null> {
  const storage = getLocalStorage();
  if (!storage.ok) return storage;

  try {
    return { ok: true, value: storage.value.getItem(key) };
  } catch (error) {
    return detectStorageError(error);
  }
}

export function writeStorageItem(key: string, value: string): DocumentStorageResult<void> {
  const storage = getLocalStorage();
  if (!storage.ok) return storage;

  try {
    storage.value.setItem(key, value);
    return { ok: true, value: undefined };
  } catch (error) {
    return detectStorageError(error);
  }
}

export function removeStorageItem(key: string): DocumentStorageResult<void> {
  const storage = getLocalStorage();
  if (!storage.ok) return storage;

  try {
    storage.value.removeItem(key);
    return { ok: true, value: undefined };
  } catch (error) {
    return detectStorageError(error);
  }
}

export function readStorageJson<T>(
  key: string,
  validate: (value: unknown) => value is T,
): DocumentStorageResult<T | null> {
  const raw = readStorageItem(key);
  if (!raw.ok) return raw;
  if (raw.value === null) return { ok: true, value: null };

  try {
    const parsed = JSON.parse(raw.value);
    if (!validate(parsed)) {
      return { ok: false, code: 'invalid-data', error: new Error(`Invalid storage data for ${key}.`) };
    }

    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, code: 'invalid-data', error };
  }
}

export function writeStorageJson<T>(key: string, value: T): DocumentStorageResult<void> {
  return writeStorageItem(key, JSON.stringify(value));
}

export function throwIfStorageFailed<T>(result: DocumentStorageResult<T>): T {
  if (!result.ok) {
    throw new DocumentStorageError(result.code, result.error);
  }

  return result.value;
}

