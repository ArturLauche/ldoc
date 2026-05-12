import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/components/theme-provider';
import { STORAGE_KEY } from '@/lib/documentLibrary';
import { RichTextEditor } from './RichTextEditor';

function renderEditor() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <TooltipProvider>
        <RichTextEditor />
      </TooltipProvider>
    </ThemeProvider>,
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
  });
});

