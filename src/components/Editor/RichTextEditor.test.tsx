import { storedItem } from '@/test/documentStorage';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
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
import { COMPACT_LAYOUT_QUERY } from '@/hooks/useMediaQuery';
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
    // The real lazy toolbar also needs its first module transform on a cold test run.
    expect(
      await screen.findByRole('button', { name: 'Insert table' }, { timeout: 3000 }),
    ).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
    const storedCurrent = JSON.parse((await storedItem(STORAGE_KEY)) ?? '{}') as {
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
    await waitFor(async () => expect(await storedItem(LEGACY_STORAGE_KEY)).toBeNull());

    await waitFor(async () => {
      expect(await getLibraryDocuments()).toHaveLength(1);
    });

    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
    const storedCurrent = JSON.parse((await storedItem(STORAGE_KEY)) ?? '{}') as {
      id?: string;
      content?: string;
    };
    const libraryDocument = (await getLibraryDocuments())[0];
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

    await waitFor(async () => {
      expect(await getLibraryDocuments()).toHaveLength(1);
    });

    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));
    const storedCurrent = JSON.parse((await storedItem(STORAGE_KEY)) ?? '{}') as {
      id?: string;
    };
    expect(storedCurrent.id).toBe((await getLibraryDocuments())[0].id);
  });
});

describe('RichTextEditor on phones', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = ((query: string) => ({
      matches: query === COMPACT_LAYOUT_QUERY,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('docks a compact toolbar and keeps the header to one row', async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'));

    const toolbar = await screen.findByRole(
      'group',
      { name: 'Document formatting' },
      { timeout: 3000 },
    );
    expect(toolbar).toHaveClass('mobile-toolbar');
    expect(toolbar).toHaveAttribute('data-scroll-inset', 'bottom');
    expect(container.querySelector('.app-shell')).toHaveClass('is-compact');
    expect(container.querySelector('.toolbar-bar')).toBeNull();
    expect(within(toolbar).getByRole('button', { name: 'Text formatting' })).toBeInTheDocument();

    // Language and theme fold into one menu so the title keeps its room.
    expect(screen.queryByRole('button', { name: 'Change language' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Display and language' }));
    expect(await screen.findByRole('menuitem', { name: 'Dark mode' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Deutsch' })).toBeInTheDocument();

    // Save state stays available on phones, with its label for assistive tech.
    expect(
      screen
        .getAllByRole('status')
        .some((status) => /on this device/i.test(status.textContent ?? '')),
    ).toBe(true);
  });
});
