import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import { LocaleProvider } from '@/components/locale-provider';
import { ConfirmProvider } from '@/components/confirm-provider';
import {
  LEGACY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  STORAGE_KEY,
  getLibraryDocuments,
} from '@/lib/documentLibrary';
import { RichTextEditor } from './RichTextEditor';

function renderEditor() {
  return render(
    <MemoryRouter>
      <ThemeProvider attribute="class" defaultTheme="light">
        <LocaleProvider>
          <ConfirmProvider>
            <TooltipProvider>
              <RichTextEditor />
            </TooltipProvider>
          </ConfirmProvider>
        </LocaleProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('RichTextEditor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads the current local document into the editor shell', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: 'doc-1',
        name: 'Loaded Document',
        content: '<p>Saved body</p>',
        savedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderEditor();

    await waitFor(() => {
      expect(screen.getByLabelText('Document name')).toHaveValue('Loaded Document');
    });
    expect(screen.getByLabelText('Document editor')).toHaveTextContent('Saved body');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Insert table' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Insert graphic' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Diagram' })).not.toBeInTheDocument();
  });

  it('does not seed the full document library for current-format startup records', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: 'doc-current',
        name: 'Current Document',
        content: '<p onclick="alert(1)">Already migrated</p><script>alert(1)</script>',
        savedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderEditor();

    await waitFor(() => {
      expect(screen.getByLabelText('Document name')).toHaveValue('Current Document');
    });

    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBeNull();
    const storedCurrent = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      content?: string;
    };
    expect(storedCurrent.content).toBe('<p>Already migrated</p>');
  });

  it('migrates legacy current documents into current storage and the library after startup', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        name: 'Legacy Document',
        content: '<p onclick="alert(1)">Legacy body</p><script>alert(1)</script>',
        savedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderEditor();

    await waitFor(() => {
      expect(screen.getByLabelText('Document name')).toHaveValue('Legacy Document');
    });

    expect(screen.getByLabelText('Document editor')).toHaveTextContent('Legacy body');
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();

    await waitFor(() => {
      expect(getLibraryDocuments()).toHaveLength(1);
    });

    const storedCurrent = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      id?: string;
      content?: string;
    };
    const libraryDocument = getLibraryDocuments()[0];
    expect(storedCurrent.id).toBe(libraryDocument.id);
    expect(storedCurrent.content).toBe('<p>Legacy body</p>');
    expect(libraryDocument.content).toBe('<p>Legacy body</p>');
  });

  it('migrates current documents without an id into the library after startup', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name: 'No Id Document',
        content: '<p>No id body</p>',
        savedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    renderEditor();

    await waitFor(() => {
      expect(screen.getByLabelText('Document name')).toHaveValue('No Id Document');
    });

    await waitFor(() => {
      expect(getLibraryDocuments()).toHaveLength(1);
    });

    const storedCurrent = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      id?: string;
    };
    expect(storedCurrent.id).toBe(getLibraryDocuments()[0].id);
  });
});

