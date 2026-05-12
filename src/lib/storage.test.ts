import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStorageJson, writeStorageItem } from './storage';

describe('storage facade', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns invalid-data for malformed JSON', () => {
    localStorage.setItem('broken', '{');
    const result = readStorageJson('broken', (value): value is { ok: boolean } => {
      return typeof value === 'object' && value !== null && 'ok' in value;
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid-data' });
  });

  it('classifies quota failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(writeStorageItem('doc', 'content')).toMatchObject({ ok: false, code: 'quota' });
  });
});

