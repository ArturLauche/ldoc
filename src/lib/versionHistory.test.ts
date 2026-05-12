import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteDocumentVersion,
  getDocumentVersions,
  saveDocumentVersion,
} from './versionHistory';

describe('versionHistory', () => {
  beforeEach(() => {
    localStorage.clear();
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
});

