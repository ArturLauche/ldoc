import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileMenu } from './FileMenu';

const documentLibraryMocks = vi.hoisted(() => ({
  getLibraryDocuments: vi.fn(() => []),
}));

vi.mock('@/lib/documentLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentLibrary')>();
  return {
    ...actual,
    getLibraryDocuments: documentLibraryMocks.getLibraryDocuments,
  };
});

describe('FileMenu startup', () => {
  beforeEach(() => {
    documentLibraryMocks.getLibraryDocuments.mockClear();
  });

  it('does not load library documents while the library dialog is closed', () => {
    render(
      <FileMenu
        editor={null}
        locale="en"
        documentId="doc-1"
        documentName="Document"
        setDocumentName={vi.fn()}
        onSaveDocument={vi.fn()}
        onLoadDocument={vi.fn()}
        onCreateNewDocument={vi.fn()}
        onShowVersionHistory={vi.fn()}
        hasUnsavedChanges={false}
      />,
    );

    expect(documentLibraryMocks.getLibraryDocuments).not.toHaveBeenCalled();
  });
});
