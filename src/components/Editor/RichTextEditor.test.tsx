import { storedItem } from '@/test/documentStorage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { useLocale } from '@/hooks/useLocale';
import { RichTextEditor } from './RichTextEditor';

function SwitchToGerman() {
  const { setLocale } = useLocale();
  return (
    <button type="button" onClick={() => void setLocale('de')}>
      Switch to German
    </button>
  );
}

function renderEditor() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <LocaleProvider>
          <ConfirmProvider>
            <TooltipProvider>
              <SwitchToGerman />
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

  it('keeps the document accessible name in the current language after later renders', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(await screen.findByLabelText('Document editor')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Switch to German' }));
    // Typing a new title re-renders the shell, which re-applies the editor options.
    await user.type(await screen.findByLabelText('Dokumentname'), ' neu');
    expect(screen.getByLabelText('Dokumenteditor')).toHaveAttribute('contenteditable', 'true');
    expect(screen.queryByLabelText('Document editor')).not.toBeInTheDocument();
  });

  it('opens the shortcut reference for Mod+/ and returns focus when it closes', async () => {
    renderEditor();
    const editor = await screen.findByLabelText('Document editor');
    // Keys that only share the physical Slash key, or that the editor
    // already handled, leave the reference closed.
    fireEvent.keyDown(window, { key: '-', code: 'Slash', ctrlKey: true });
    fireEvent.keyDown(window, { key: '.', code: 'Slash', ctrlKey: true });
    const handled = new KeyboardEvent('keydown', { key: '/', ctrlKey: true, shiftKey: true, cancelable: true });
    handled.preventDefault();
    act(() => {
      window.dispatchEvent(handled);
    });
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();

    act(() => editor.focus());
    fireEvent.keyDown(editor, { key: '/', code: 'Slash', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    act(() => {
      fireEvent.keyDown(dialog, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it('opens toolbar menus on a tap, not when a touch scroll starts on them', async () => {
    renderEditor();
    for (const name of ['Alignment', 'Line spacing']) {
      const trigger = await screen.findByRole('button', { name }, { timeout: 3000 });
      fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0 });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      fireEvent.click(trigger);
      expect(await screen.findByRole('menu')).toBeInTheDocument();
      act(() => {
        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      });
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    }
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
    await user.click(screen.getByRole('button', { name: 'Preferences' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Deutsch' })).toBeInTheDocument();

    // Save state stays in the phone header as an icon, with its label kept
    // for assistive tech.
    const saveStatus = container.querySelector<HTMLElement>('header [role="status"]');
    expect(saveStatus).not.toBeNull();
    expect(within(saveStatus!).getByText(/on this device/i)).toHaveClass('sr-only');
  });
});
