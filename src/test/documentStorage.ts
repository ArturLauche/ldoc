import { IDBObjectStore } from 'fake-indexeddb';
import { vi } from 'vitest';
import { readDocumentItem, writeDocumentItem } from '@/lib/documentDatabase';
import { throwIfStorageFailed } from '@/lib/storage';

export async function storedItem(key: string) {
  return throwIfStorageFailed(await readDocumentItem(key));
}
export async function storeItem(key: string, value: string | null) {
  throwIfStorageFailed(await writeDocumentItem(key, value));
}
export function failDocumentWrites(onlyKey?: string) {
  const put = IDBObjectStore.prototype.put;
  return vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (!onlyKey || key === onlyKey) throw new DOMException('Full', 'QuotaExceededError');
    return put.call(this, value, key);
  });
}
