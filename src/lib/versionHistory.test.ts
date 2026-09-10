import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_VERSION_IDLE_MS,
  AUTO_VERSION_PERIODIC_MS,
  considerAutomaticVersion,
  deleteDocumentVersion,
  getDocumentVersions,
  isTrivialVersionContent,
  saveDocumentVersion,
} from './versionHistory';

describe('versionHistory', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the latest 20 versions per document and sanitizes content', () => {
    for (let index = 0; index < 25; index += 1) {
      saveDocumentVersion({
        documentId: 'doc-1',
        name: `Version ${index}`,
        content: `<p onclick="alert(1)">Version ${index}</p><script>alert(1)</script>`,
      });
    }

    const versions = getDocumentVersions('doc-1');
    expect(versions).toHaveLength(20);
    expect(versions[0].content).not.toContain('<script>');
    expect(versions[0].content).not.toContain('onclick');
  });

  it('deletes a saved version by id', () => {
    const saved = saveDocumentVersion({
      documentId: 'doc-1',
      name: 'Snapshot',
      content: '<p>Snapshot</p>',
    });

    deleteDocumentVersion(saved.id);
    expect(getDocumentVersions('doc-1')).toEqual([]);
  });

  it('treats empty editor placeholders as trivial', () => {
    expect(isTrivialVersionContent('')).toBe(true);
    expect(isTrivialVersionContent('<p></p>')).toBe(true);
    expect(isTrivialVersionContent('<p><br></p>')).toBe(true);
    expect(isTrivialVersionContent('<p>Hello</p>')).toBe(false);
  });

  it('creates a baseline automatic version for the first meaningful content', () => {
    const result = considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>First draft</p>',
      lastEditAt: Date.now(),
      autoVersionLabel: 'Automatic version',
    });

    expect(result.saved).toBe(true);
    if (!result.saved) return;
    expect(result.reason).toBe('baseline');
    expect(result.version.kind).toBe('auto');
    expect(getDocumentVersions('doc-1')).toHaveLength(1);
  });

  it('skips automatic versions when content is unchanged or trivial', () => {
    considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Same</p>',
      lastEditAt: Date.now(),
      autoVersionLabel: 'Automatic version',
    });

    expect(
      considerAutomaticVersion({
        documentId: 'doc-1',
        content: '<p>Same</p>',
        lastEditAt: Date.now(),
        autoVersionLabel: 'Automatic version',
      }),
    ).toEqual({ saved: false, reason: 'unchanged' });

    expect(
      considerAutomaticVersion({
        documentId: 'doc-1',
        content: '<p></p>',
        lastEditAt: Date.now(),
        autoVersionLabel: 'Automatic version',
      }),
    ).toEqual({ saved: false, reason: 'trivial' });
  });

  it('waits during active editing, then checkpoints after an idle pause', () => {
    const startedAt = Date.now();
    considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Session start</p>',
      lastEditAt: startedAt,
      autoVersionLabel: 'Automatic version',
    });

    const tooSoon = considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Still typing</p>',
      lastEditAt: startedAt + 5_000,
      now: startedAt + 5_000,
      autoVersionLabel: 'Automatic version',
    });
    expect(tooSoon).toEqual({ saved: false, reason: 'too-soon' });
    expect(getDocumentVersions('doc-1')).toHaveLength(1);

    const afterIdle = considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Still typing</p>',
      lastEditAt: startedAt + 5_000,
      now: startedAt + 5_000 + AUTO_VERSION_IDLE_MS,
      autoVersionLabel: 'Automatic version',
    });

    expect(afterIdle.saved).toBe(true);
    if (!afterIdle.saved) return;
    expect(afterIdle.reason).toBe('idle');
    expect(getDocumentVersions('doc-1')).toHaveLength(2);
    expect(getDocumentVersions('doc-1')[0].content).toContain('Still typing');
  });

  it('creates a periodic checkpoint during long continuous editing', () => {
    const startedAt = Date.now();
    considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Minute 0</p>',
      lastEditAt: startedAt,
      autoVersionLabel: 'Automatic version',
    });

    const periodic = considerAutomaticVersion({
      documentId: 'doc-1',
      content: '<p>Minute 10</p>',
      lastEditAt: startedAt + AUTO_VERSION_PERIODIC_MS,
      now: startedAt + AUTO_VERSION_PERIODIC_MS,
      autoVersionLabel: 'Automatic version',
    });

    expect(periodic.saved).toBe(true);
    if (!periodic.saved) return;
    expect(periodic.reason).toBe('periodic');
    expect(getDocumentVersions('doc-1')).toHaveLength(2);
  });

  it('preserves explicit kind metadata for manual and safety versions', () => {
    const manual = saveDocumentVersion({
      documentId: 'doc-1',
      name: 'Named',
      content: '<p>Manual</p>',
      kind: 'manual',
    });
    const safety = saveDocumentVersion({
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

it('ignores malformed dates on reads and preserves them on failed writes', () => {
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
  expect(getDocumentVersions('doc-1')).toEqual([]);
  expect(() =>
    saveDocumentVersion({ documentId: 'doc-1', content: '<p>New</p>', name: 'New' }),
  ).toThrow();
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

  it('migrates both legacy keys before removing either source', () => {
    localStorage.setItem('lwrite-versions', JSON.stringify([legacy('one')]));
    localStorage.setItem('floatwrite-versions', JSON.stringify([legacy('two')]));
    expect(getDocumentVersions('draft', { strict: true }).map((version) => version.id)).toEqual([
      'one',
      'two',
    ]);
    expect(localStorage.getItem('lwrite-versions')).toBeNull();
    expect(localStorage.getItem('floatwrite-versions')).toBeNull();
  });

  it('retries a partially completed migration without duplicating snapshots', () => {
    localStorage.setItem('lwrite-versions', JSON.stringify([legacy('one')]));
    const setItem = Storage.prototype.setItem;
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === 'lwrite-document-versions-migrated')
        throw new DOMException('Full', 'QuotaExceededError');
      setItem.call(this, key, value);
    });
    expect(() => getDocumentVersions('draft', { strict: true })).toThrow();
    expect(localStorage.getItem('lwrite-versions')).not.toBeNull();
    failing.mockRestore();
    expect(getDocumentVersions('draft', { strict: true })).toHaveLength(1);
    expect(localStorage.getItem('lwrite-document-versions-migrated')).toBe('true');
  });

  it('applies the per-document cap during migration and preserves malformed source data', () => {
    localStorage.setItem(
      'lwrite-versions',
      JSON.stringify(Array.from({ length: 25 }, (_, i) => legacy(String(i)))),
    );
    expect(getDocumentVersions('draft', { strict: true })).toHaveLength(20);
    localStorage.clear();
    localStorage.setItem('lwrite-versions', '{broken');
    expect(() => getDocumentVersions('draft', { strict: true })).toThrow();
    expect(localStorage.getItem('lwrite-versions')).toBe('{broken');
    expect(localStorage.getItem('lwrite-document-versions-migrated')).toBeNull();
  });
});

it('rejects duplicate history ids before a mutation can delete multiple records', () => {
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
  expect(() => deleteDocumentVersion('duplicate')).toThrow();
  expect(localStorage.getItem('lwrite-document-versions')).toBe(raw);
  localStorage.clear();
});
