import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Editor } from '@tiptap/core';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { ConfirmProvider } from '@/components/confirm-provider';
import { FileMenu } from './FileMenu';
import { createEditorExtensions } from './editorExtensions';

const documentLibraryMocks = vi.hoisted(() => ({
  getLibraryDocuments: vi.fn(() => []),
}));

const printMocks = vi.hoisted(() => ({
  printDocument: vi.fn(),
}));

vi.mock('@/lib/documentLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentLibrary')>();
  return {
    ...actual,
    getLibraryDocuments: documentLibraryMocks.getLibraryDocuments,
  };
});

vi.mock('@/lib/printDocument', () => ({
  printDocument: printMocks.printDocument,
}));

describe('FileMenu startup', () => {
  beforeEach(() => {
    documentLibraryMocks.getLibraryDocuments.mockClear();
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
      'Plain text (.txt)',
      'Web page (.html)',
      'Rich Text Format (.rtf)',
      'Word document (.docx)',
      'OpenDocument text (.odt)',
      'PDF document (.pdf)',
    ]) {
      expect(within(sheet).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole('button', { name: 'Open from library…' })).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Back up library (.json)' }),
    ).toBeInTheDocument();

    // Dialog actions wait for the sheet to close and release focus.
    await user.click(within(sheet).getByRole('button', { name: 'Version history' }));
    await waitFor(() => expect(onShowVersionHistory).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'File' })).not.toBeInTheDocument();
  });
});

describe('FileMenu printing', () => {
  let editor: Editor;
  let windowPrint: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Checklist body</p>',
    });
    windowPrint = vi.spyOn(window, 'print').mockImplementation(() => {
      /* no native dialog in jsdom */
    });
    printMocks.printDocument.mockReset();
  });

  afterEach(() => {
    editor.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function renderMenu() {
    return render(
      <LocaleProvider>
        <ConfirmProvider>
          <FileMenu
            editor={editor}
            documentId="doc-1"
            documentName="Print checklist"
            setDocumentName={vi.fn()}
            onSaveDocument={vi.fn()}
            onLoadDocument={vi.fn()}
            onCreateNewDocument={vi.fn()}
            onImportDocument={vi.fn()}
            onShowVersionHistory={vi.fn()}
          />
        </ConfirmProvider>
      </LocaleProvider>,
    );
  }

  async function printViaMenu() {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('menuitem', { name: /^Print/ }));
  }

  it('prints the rendered export document instead of the editor page', async () => {
    printMocks.printDocument.mockResolvedValue(undefined);
    await printViaMenu();

    await waitFor(() => expect(printMocks.printDocument).toHaveBeenCalledTimes(1));
    const options = printMocks.printDocument.mock.calls[0][0];
    expect(options.name).toBe('Print checklist');
    expect(options.locale).toBe('en');
    expect(options.html).toContain('Checklist body');
    expect(windowPrint).not.toHaveBeenCalled();
  });

  it('warns and prints the editor page when the print document cannot be prepared', async () => {
    const warning = vi.spyOn(toast, 'warning');
    printMocks.printDocument.mockRejectedValue(new Error('This document is too large to export.'));
    // jsdom has no animation frames; run the fallback frame immediately.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });

    await printViaMenu();

    await waitFor(() => expect(windowPrint).toHaveBeenCalledTimes(1));
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][0]).toContain('This document is too large to export.');
    expect(warning.mock.calls[0][0]).toContain('printed the editor page instead');
  });

  it('guards the menu while a print is being prepared', async () => {
    let finishPrint!: () => void;
    printMocks.printDocument.mockImplementation(
      () => new Promise<void>((resolve) => (finishPrint = resolve)),
    );

    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'File' }));
    await user.click(screen.getByRole('menuitem', { name: /^Print/ }));
    await waitFor(() => expect(printMocks.printDocument).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'File' }));
    const item = screen.getByRole('menuitem', { name: /^Print/ });
    expect(item).toHaveAttribute('data-disabled');

    finishPrint();
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: /^Print/ })).not.toHaveAttribute('data-disabled'),
    );
  });
});
