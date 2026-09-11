import { failDocumentWrites, storedItem, storeItem } from '@/test/documentStorage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_VERSION_IDLE_MS,
  AUTO_VERSION_PERIODIC_MS,
  considerAutomaticVersion,
  deleteDocumentVersion,
  getDocumentVersions,
  isTrivialVersionContent,
  migrateLegacyVersionsToDocument,
  saveDocumentVersion,
} from './versionHistory';

describe('versionHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the latest 20 versions per document and sanitizes content', async () => {
    for (let index = 0; index < 25; index += 1) {
      await saveDocumentVersion({
        documentId: 'doc-1',
        name: `Version ${index}`,
        content: `<p onclick="alert(1)">Version ${index}</p><script>alert(1)</script>`,
      });
    }

    const versions = await getDocumentVersions('doc-1');
    expect(versions).toHaveLength(20);
    expect(versions[0].content).not.toContain('<script>');
    expect(versions[0].content).not.toContain('onclick');
  });

  it('deletes a saved version by id', async () => {
    const saved = await saveDocumentVersion({
      documentId: 'doc-1',
      name: 'Snapshot',
      content: '<p>Snapshot</p>',
    });

    await deleteDocumentVersion(saved.id);
    expect(await getDocumentVersions('doc-1')).toEqual([]);
  });

  it('treats empty editor placeholders as trivial', () => {
    expect(isTrivialVersionContent('')).toBe(true);
    expect(isTrivialVersionContent('<p></p>')).toBe(true);
    expect(isTrivialVersionContent('<p><br></p>')).toBe(true);
    expect(isTrivialVersionContent('<p>Hello</p>')).toBe(false);
  });

  it('creates a baseline automatic version for the first meaningful content', async () => {
    const result = await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>First draft</p>',
      lastEditAt: Date.now(),
      autoVersionLabel: 'Automatic version',
    });

    expect(result.saved).toBe(true);
    if (!result.saved) return;
    expect(result.reason).toBe('baseline');
    expect(result.version.kind).toBe('auto');
    expect(await getDocumentVersions('doc-1')).toHaveLength(1);
  });

  it('skips automatic versions when content is unchanged or trivial', async () => {
    await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Same</p>',
      lastEditAt: Date.now(),
      autoVersionLabel: 'Automatic version',
    });

    expect(
      await considerAutomaticVersion({
        documentId: 'doc-1',
        content: '<p>Same</p>',
        lastEditAt: Date.now(),
        autoVersionLabel: 'Automatic version',
      }),
    ).toEqual({ saved: false, reason: 'unchanged' });

    expect(
      await considerAutomaticVersion({
        documentId: 'doc-1',
        content: '<p></p>',
        lastEditAt: Date.now(),
        autoVersionLabel: 'Automatic version',
      }),
    ).toEqual({ saved: false, reason: 'trivial' });
  });

  it('waits during active editing, then checkpoints after an idle pause', async () => {
    const startedAt = Date.now();
    await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Session start</p>',
      lastEditAt: startedAt,
      autoVersionLabel: 'Automatic version',
    });

    const tooSoon = await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Still typing</p>',
      lastEditAt: startedAt + 5_000,
      now: startedAt + 5_000,
      autoVersionLabel: 'Automatic version',
    });
    expect(tooSoon).toEqual({ saved: false, reason: 'too-soon' });
    expect(await getDocumentVersions('doc-1')).toHaveLength(1);

    const afterIdle = await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Still typing</p>',
      lastEditAt: startedAt + 5_000,
      now: startedAt + 5_000 + AUTO_VERSION_IDLE_MS,
      autoVersionLabel: 'Automatic version',
    });

    expect(afterIdle.saved).toBe(true);
    if (!afterIdle.saved) return;
    expect(afterIdle.reason).toBe('idle');
    expect(await getDocumentVersions('doc-1')).toHaveLength(2);
    expect((await getDocumentVersions('doc-1'))[0].content).toContain('Still typing');
  });

  it('creates a periodic checkpoint during long continuous editing', async () => {
    const startedAt = Date.now();
    await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Minute 0</p>',
      lastEditAt: startedAt,
      autoVersionLabel: 'Automatic version',
    });

    const periodic = await considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Minute 10</p>',
      lastEditAt: startedAt + AUTO_VERSION_PERIODIC_MS,
      now: startedAt + AUTO_VERSION_PERIODIC_MS,
      autoVersionLabel: 'Automatic version',
    });

    expect(periodic.saved).toBe(true);
    if (!periodic.saved) return;
    expect(periodic.reason).toBe('periodic');
    expect(await getDocumentVersions('doc-1')).toHaveLength(2);
  });

  it('preserves explicit kind metadata for manual and safety versions', async () => {
    const manual = await saveDocumentVersion({
      documentId: 'doc-1',
      name: 'Named',
      content: '<p>Manual</p>',
      kind: 'manual',
    });
    const safety = await saveDocumentVersion({
      documentId: 'doc-1',
      name: 'Before open',
      content: '<p>Safety</p>',
      kind: 'safety',
    });

    expect(manual.kind).toBe('manual');
    expect(safety.kind).toBe('safety');
  });
});

it('recognizes image-only documents as meaningful versions', () => {
  expect(isTrivialVersionContent('<img src="data:image/png;base64,YWJj" alt="Diagram">')).toBe(
    false,
  );
});

it('ignores malformed dates on reads and preserves them on failed writes', async () => {
  const raw = JSON.stringify([
    {
      id: 'bad',
      documentId: 'doc-1',
      content: '<p>Draft</p>',
      name: 'Bad date',
      timestamp: 'invalid',
    },
  ]);
  localStorage.setItem('lwrite-document-versions', raw);
  expect(await getDocumentVersions('doc-1')).toEqual([]);
  await expect(
    saveDocumentVersion({
      documentId: 'doc-1',
      content: '<p>New</p>',
      name: 'New',
    }),
  ).rejects.toThrow();
  expect(localStorage.getItem('lwrite-document-versions')).toBe(raw);
  localStorage.clear();
});

describe('legacy history migration', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  const legacy = (id: string) => ({
    id,
    name: id,
    content: `<p>${id}</p>`,
    timestamp: '2026-09-01T12:00:00Z',
  });

  it('migrates both legacy keys atomically while retaining original recovery sources', async () => {
    localStorage.setItem('lwrite-versions', JSON.stringify([legacy('one')]));
    localStorage.setItem('floatwrite-versions', JSON.stringify([legacy('two')]));
    await migrateLegacyVersionsToDocument('draft');
    expect(
      (await getDocumentVersions('draft', { strict: true })).map((version) => version.id),
    ).toEqual(['one', 'two']);
    expect(await storedItem('lwrite-versions')).toBeNull();
    expect(await storedItem('floatwrite-versions')).toBeNull();
    expect(localStorage.getItem('lwrite-versions')).not.toBeNull();
  });

  it('rolls back all migration writes if the flag fails and retries without duplicates', async () => {
    localStorage.setItem('lwrite-versions', JSON.stringify([legacy('one')]));
    const failing = failDocumentWrites('lwrite-document-versions-migrated');
    await expect(migrateLegacyVersionsToDocument('draft')).rejects.toThrow();
    expect(localStorage.getItem('lwrite-versions')).not.toBeNull();
    failing.mockRestore();
    expect(await getDocumentVersions('draft')).toHaveLength(0);
    await migrateLegacyVersionsToDocument('draft');
    await migrateLegacyVersionsToDocument('draft');
    expect(await getDocumentVersions('draft')).toHaveLength(1);
    expect(await storedItem('lwrite-document-versions-migrated')).toBe('true');
  });

  it('applies the cap during migration and preserves malformed source data', async () => {
    localStorage.setItem(
      'lwrite-versions',
      JSON.stringify(Array.from({ length: 25 }, (_, i) => legacy(String(i)))),
    );
    await migrateLegacyVersionsToDocument('draft');
    expect(await getDocumentVersions('draft')).toHaveLength(20);
    await storeItem('lwrite-document-versions-migrated', null);
    await storeItem('lwrite-versions', '{broken');
    await expect(migrateLegacyVersionsToDocument('draft')).rejects.toThrow();
    expect(await storedItem('lwrite-versions')).toBe('{broken');
    expect(await storedItem('lwrite-document-versions-migrated')).toBeNull();
  });
});

it('rejects duplicate history ids before a mutation can delete multiple records', async () => {
  localStorage.clear();
  const version = {
    id: 'duplicate',
    documentId: 'draft',
    name: 'First',
    content: '<p>First</p>',
    timestamp: '2026-09-01T12:00:00Z',
  };
  const raw = JSON.stringify([version, { ...version, name: 'Second' }]);
  localStorage.setItem('lwrite-document-versions', raw);
  await expect(deleteDocumentVersion('duplicate')).rejects.toThrow();
  expect(localStorage.getItem('lwrite-document-versions')).toBe(raw);
  localStorage.clear();
});
