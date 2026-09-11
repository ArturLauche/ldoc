import { beforeEach, describe, expect, it } from 'vitest';
import { readCurrentDocument } from './currentDocument';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './documentLibrary';

beforeEach(() => localStorage.clear());
describe('current document boundary', () => {
  it.each([
    'null',
    '[]',
    '{',
    '{"content":3}',
    '{"content":"ok","id":12}',
    '{"content":"ok","savedAt":"invalid"}',
  ])('rejects invalid fields without mutating %s', async (raw) => {
    localStorage.setItem(STORAGE_KEY, raw);
    expect(await readCurrentDocument('Untitled')).toMatchObject({
      ok: false,
      code: 'invalid-data',
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it('normalizes a legacy record and sanitizes HTML', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ content: '<p onclick="x()">Safe</p>', name: '' }),
    );
    expect(await readCurrentDocument('Untitled')).toMatchObject({
      ok: true,
      value: {
        source: LEGACY_STORAGE_KEY,
        needsMigration: true,
        document: { name: 'Untitled', content: '<p>Safe</p>', savedAt: null },
      },
    });
  });
});
