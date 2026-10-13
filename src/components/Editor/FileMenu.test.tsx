import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { ConfirmProvider } from '@/components/confirm-provider';
import { FileMenu } from './FileMenu';

const documentLibraryMocks = vi.hoisted(() => ({
  getLibraryDocuments: vi.fn(() => []),
  importSingleLibraryDocument: vi.fn(),
}));
const fileMocks = vi.hoisted(() => ({ pickFileBatch: vi.fn() }));

vi.mock('@/lib/native/files', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/native/files')>(),
  pickFileBatch: fileMocks.pickFileBatch,
}));

vi.mock('@/lib/documentLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentLibrary')>();
  return {
    ...actual,
    getLibraryDocuments: documentLibraryMocks.getLibraryDocuments,
    importSingleLibraryDocument: documentLibraryMocks.importSingleLibraryDocument,
  };
});

describe('FileMenu startup', () => {
  beforeEach(() => {
    documentLibraryMocks.getLibraryDocuments.mockClear();
    documentLibraryMocks.importSingleLibraryDocument.mockReset();
    fileMocks.pickFileBatch.mockReset();
  });

  it('does not load library documents while the library dialog is closed', () => {
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <FileMenu
            editor={null}
            documentId="doc-1"
            documentName="Document"
            setDocumentName={vi.fn()}
            onSaveDocument={vi.fn()}
            onLoadDocument={vi.fn()}
            onCreateNewDocument={vi.fn()}
            onShowVersionHistory={vi.fn()}
            onImportDocument={vi.fn()}
          />
        </ConfirmProvider>
      </LocaleProvider>,
    );

    expect(documentLibraryMocks.getLibraryDocuments).not.toHaveBeenCalled();
  });

  it('uses a folder icon for the menu opener, not the brand document mark', () => {
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <FileMenu
            editor={null}
            documentId="doc-1"
            documentName="Document"
            setDocumentName={vi.fn()}
            onSaveDocument={vi.fn()}
            onLoadDocument={vi.fn()}
            onCreateNewDocument={vi.fn()}
            onShowVersionHistory={vi.fn()}
            onImportDocument={vi.fn()}
          />
        </ConfirmProvider>
      </LocaleProvider>,
    );

    const trigger = screen.getByRole('button', { name: /file|datei/i });
    expect(trigger.querySelector('.lucide-folder')).not.toBeNull();
    expect(trigger.querySelector('.lucide-file-text')).toBeNull();
  });

  it('opens grouped file actions in a sheet on phones instead of nested menus', async () => {
    const user = userEvent.setup();
    const onShowVersionHistory = vi.fn();
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <FileMenu
            compact
            editor={null}
            documentId="doc-1"
            documentName="Quarterly review"
            setDocumentName={vi.fn()}
            onSaveDocument={vi.fn()}
            onLoadDocument={vi.fn()}
            onCreateNewDocument={vi.fn()}
            onShowVersionHistory={onShowVersionHistory}
            onImportDocument={vi.fn()}
          />
        </ConfirmProvider>
      </LocaleProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'File' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'File' });
    expect(within(sheet).getByText('Quarterly review')).toBeInTheDocument();
    // Every action is a direct button; nothing opens a nested menu.
    expect(sheet.querySelector('[aria-haspopup="menu"]')).toBeNull();
    for (const label of [
      'Plain Text (.txt)',
      'HTML Document (.html)',
      'Rich Text Format (.rtf)',
      'Word Document (.docx)',
      'OpenDocument Text (.odt)',
      'PDF Document (.pdf)',
    ]) {
      expect(within(sheet).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole('button', { name: 'Search Documents' })).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Export All Docs (.json)' }),
    ).toBeInTheDocument();

    // Dialog actions wait for the sheet to close and release focus.
    await user.click(within(sheet).getByRole('button', { name: 'Version History' }));
    await waitFor(() => expect(onShowVersionHistory).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'File' })).not.toBeInTheDocument();
  });

  it('finishes saving each selected file before requesting the next and preserves the open draft', async () => {
    const user = userEvent.setup();
    const onImportDocument = vi.fn();
    let finish: (value: { name: string }) => void = () => {};
    const first = new Promise<{ name: string }>((resolve) => { finish = resolve; });
    documentLibraryMocks.importSingleLibraryDocument.mockImplementationOnce(() => first).mockResolvedValue({ name: 'Second' });
    const nextFile = vi.fn();
    fileMocks.pickFileBatch.mockImplementation(async function* () {
      yield new File(['first'], 'first.json', { type: 'application/json' });
      nextFile();
      yield new File(['second'], 'second.json', { type: 'application/json' });
    });
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <FileMenu
            compact
            editor={null}
            documentId="doc-1"
            documentName="Current draft"
            setDocumentName={vi.fn()}
            onSaveDocument={vi.fn()}
            onLoadDocument={vi.fn()}
            onCreateNewDocument={vi.fn()}
            onShowVersionHistory={vi.fn()}
            onImportDocument={onImportDocument}
          />
        </ConfirmProvider>
      </LocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('button', { name: 'Import Single Files' }));
    await waitFor(() => expect(documentLibraryMocks.importSingleLibraryDocument).toHaveBeenCalledTimes(1));
    expect(nextFile).not.toHaveBeenCalled();
    await act(async () => { finish({ name: 'First' }); });
    await waitFor(() => expect(documentLibraryMocks.importSingleLibraryDocument).toHaveBeenCalledTimes(2));
    expect(nextFile).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(documentLibraryMocks.getLibraryDocuments).toHaveBeenCalledTimes(1));
    expect(onImportDocument).not.toHaveBeenCalled();
  });
});
