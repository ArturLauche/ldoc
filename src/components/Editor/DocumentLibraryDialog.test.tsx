import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { DocumentLibraryDialog } from './DocumentLibraryDialog';

describe('document library text search', () => {
  it('preserves word boundaries between blocks without searching markup', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <DocumentLibraryDialog
          open
          onOpenChange={vi.fn()}
          currentId="draft"
          error={false}
          importing={false}
          onImport={vi.fn()}
          onOpen={vi.fn()}
          onExport={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          documents={[
            {
              id: 'draft',
              name: 'Working document',
              content: '<h2>Release</h2><p>notes with <b>emphasis</b>.</p>',
              createdAt: '2026-09-01T12:00:00Z',
              updatedAt: '2026-09-01T12:00:00Z',
            },
          ]}
        />
      </LocaleProvider>,
    );
    const search = screen.getByRole('textbox', { name: 'Search saved documents' });
    await user.type(search, 'Release notes');
    expect(screen.getByRole('button', { name: /^Working document/ })).toHaveTextContent(
      'Release notes with emphasis.',
    );
    await user.clear(search);
    await user.type(search, '<h2>');
    expect(screen.getByText('No matching documents.')).toBeInTheDocument();
  });
});
