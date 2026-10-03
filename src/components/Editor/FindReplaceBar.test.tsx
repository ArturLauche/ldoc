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
    expect(
      screen.queryByRole('button', { name: 'Replace and match case' }),
    ).not.toBeInTheDocument();
  });

  it('keeps phones to one row until replace is requested', async () => {
    const user = userEvent.setup();
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>cat cat dog</p>',
    });
    renderBar(editor, true);
    expect(screen.queryByRole('textbox', { name: 'Replace with...' })).not.toBeInTheDocument();
    // The field keeps its width: match case waits with replace.
    expect(screen.queryByRole('button', { name: 'Match case' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Find...' }), 'cat');
    // A short counter fits the field; the sentence is for screen readers.
    expect(screen.getByText('1/2')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('1 of 2')).toHaveClass('sr-only');

    const toggle = screen.getByRole('button', { name: 'Replace and match case' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Match case' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.type(screen.getByRole('textbox', { name: 'Replace with...' }), 'bird');
    await user.click(screen.getByRole('button', { name: 'Replace All' }));
    expect(editor.getText()).toBe('bird bird dog');
  });
});
