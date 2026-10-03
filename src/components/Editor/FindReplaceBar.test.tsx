import { Editor } from '@tiptap/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createEditorExtensions } from './editorExtensions';
import { FindReplaceBar } from './FindReplaceBar';

function renderBar(editor: Editor, compact: boolean) {
  return render(
    <LocaleProvider>
      <TooltipProvider>
        <FindReplaceBar editor={editor} compact={compact} onClose={vi.fn()} />
      </TooltipProvider>
    </LocaleProvider>,
  );
}

describe('FindReplaceBar layouts', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it('shows find and replace together on wide screens', () => {
    editor = new Editor({ extensions: createEditorExtensions(() => ''), content: '<p>a</p>' });
    renderBar(editor, false);
    expect(screen.getByRole('textbox', { name: 'Find...' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Replace with...' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show replace' })).not.toBeInTheDocument();
  });

  it('keeps phones to one row until replace is requested', async () => {
    const user = userEvent.setup();
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>cat cat dog</p>',
    });
    renderBar(editor, true);
    expect(screen.queryByRole('textbox', { name: 'Replace with...' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Find...' }), 'cat');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Show replace' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByRole('textbox', { name: 'Replace with...' }), 'bird');
    await user.click(screen.getByRole('button', { name: 'Replace All' }));
    expect(editor.getText()).toBe('bird bird dog');
  });
});
