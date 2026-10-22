import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { trackInputModality } from '@/lib/inputModality';
import { DocumentLibraryDialog } from './DocumentLibraryDialog';

const DRAFT = {
  id: 'draft',
  name: 'Working document',
  content: '<h2>Release</h2><p>notes with <b>emphasis</b>.</p>',
  createdAt: '2026-09-01T12:00:00Z',
  updatedAt: '2026-09-01T12:00:00Z',
};

function renderLibrary(props: Partial<ComponentProps<typeof DocumentLibraryDialog>> = {}) {
  const all: ComponentProps<typeof DocumentLibraryDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    currentId: 'draft',
    error: false,
    importing: false,
    onImport: vi.fn(),
    onOpen: vi.fn(),
    onExport: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    documents: [DRAFT],
    listedAt: Date.parse('2026-09-01T12:00:30Z'),
    ...props,
  };
  const view = render(
    <LocaleProvider>
      <DocumentLibraryDialog {...all} />
    </LocaleProvider>,
  );
  return {
    ...view,
    rerender: (next: Partial<ComponentProps<typeof DocumentLibraryDialog>>) =>
      view.rerender(
        <LocaleProvider>
          <DocumentLibraryDialog {...all} {...next} />
        </LocaleProvider>,
      ),
  };
}

describe('document library text search', () => {
  it('preserves word boundaries between blocks without searching markup', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const search = screen.getByRole('textbox', { name: 'Search saved documents' });
    await user.type(search, 'Release notes');
    expect(screen.getByRole('button', { name: /^Working document/ })).toHaveTextContent(
      'Release notes with emphasis.',
    );
    await user.clear(search);
    await user.type(search, '<h2>');
    expect(screen.getByText('No documents match your search.')).toBeInTheDocument();
  });

  it('keeps focus in the search field after either clear button', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const search = screen.getByRole('textbox', { name: 'Search saved documents' });
    await user.type(search, 'zzz');
    await user.click(screen.getAllByRole('button', { name: 'Clear search' })[0]);
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();

    await user.type(search, 'zzz');
    const buttons = screen.getAllByRole('button', { name: 'Clear search' });
    await user.click(buttons[buttons.length - 1]);
    expect(search).toHaveFocus();
  });
});

describe('document library states', () => {
  it('dates documents from when the list was read', () => {
    const { rerender } = renderLibrary();
    expect(screen.getByText('now')).toBeInTheDocument();
    // The same dialog stays mounted; a later read moves "now" with it.
    rerender({ listedAt: Date.parse('2026-09-01T15:00:00Z') });
    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
  });

  it('keeps the rows while a refresh runs, so focus is not lost', () => {
    renderLibrary({ loading: true });
    expect(screen.getByRole('button', { name: /^Working document/ })).toBeInTheDocument();
  });

  it('keeps focus in the dialog when the focused row disappears', () => {
    const { rerender } = renderLibrary();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    rerender({ documents: [] });
    expect(screen.getByRole('textbox', { name: 'Search saved documents' })).toHaveFocus();
  });

  it('keeps focus on the dialog, not the search field, after a tap', () => {
    const stop = trackInputModality();
    try {
      const { rerender } = renderLibrary();
      fireEvent.pointerDown(document.body, { pointerType: 'touch' });
      (document.activeElement as HTMLElement | null)?.blur();
      rerender({ documents: [] });
      expect(screen.getByRole('dialog')).toHaveFocus();
    } finally {
      stop();
    }
  });

  it('shows the skeleton only before the first list arrives', () => {
    renderLibrary({ loading: true, documents: [] });
    expect(screen.queryByRole('button', { name: /^Working document/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
