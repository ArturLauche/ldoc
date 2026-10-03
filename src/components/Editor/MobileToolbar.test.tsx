import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createEditorExtensions } from './editorExtensions';
import { MobileToolbar } from './MobileToolbar';

function createTestEditor(content = '<p>Hello world</p>') {
  return new Editor({
    extensions: createEditorExtensions(() => 'Start writing...'),
    content,
  });
}

function renderToolbar(editor: Editor) {
  return render(
    <LocaleProvider>
      <TooltipProvider>
        <MobileToolbar editor={editor} />
      </TooltipProvider>
    </LocaleProvider>,
  );
}

describe('MobileToolbar', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it('keeps one row of frequent actions with pressed states', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderToolbar(editor);
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });

    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    await user.click(bold);
    expect(editor.getHTML()).toContain('<strong>Hello</strong>');
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Undo', 'Redo', 'Italic', 'Underline', 'Bullet list', 'Numbered list']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('does not take focus away from the editor when a button is pressed', () => {
    editor = createTestEditor();
    renderToolbar(editor);
    const bold = screen.getByRole('button', { name: 'Bold' });
    // Default mousedown behavior moves focus (and closes a touch keyboard).
    expect(fireEvent.mouseDown(bold)).toBe(false);
  });

  it('opens formatting in a labeled panel and applies styles from it', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderToolbar(editor);
    act(() => {
      editor.commands.setTextSelection(3);
    });

    const toggle = screen.getByRole('button', { name: 'Text formatting' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: 'Formatting options' });
    expect(toggle).toHaveAttribute('aria-controls', panel.id);

    await user.click(within(panel).getByRole('button', { name: 'Heading 2' }));
    expect(editor.getHTML()).toContain('<h2>Hello world</h2>');
    expect(within(panel).getByRole('button', { name: 'Heading 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(panel).getByRole('button', { name: 'Increase font size' }));
    expect(editor.getAttributes('textStyle').fontSize).toBe('18px');
    expect(within(panel).getByText('18')).toBeInTheDocument();

    await user.click(within(panel).getByRole('tab', { name: 'Paragraph' }));
    await user.click(within(panel).getByRole('button', { name: 'Align center' }));
    expect(editor.getHTML()).toContain('text-align: center');

    await user.click(within(panel).getByRole('tab', { name: 'Color' }));
    expect(within(panel).getAllByRole('button', { name: /^Set text color/ })).toHaveLength(12);
    expect(within(panel).getByRole('button', { name: 'Remove highlight' })).toBeInTheDocument();
  });

  it('closes the panel with Escape or its toggle, and offers insert tiles', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderToolbar(editor);

    await user.click(screen.getByRole('button', { name: 'Text formatting' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Formatting options' })).not.toBeInTheDocument();

    const insert = screen.getByRole('button', { name: 'Insert' });
    await user.click(insert);
    const panel = screen.getByRole('region', { name: 'Insert' });
    for (const name of ['Insert link', 'Insert image', 'Insert table', 'Insert graphic']) {
      expect(within(panel).getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(insert);
    expect(screen.queryByRole('region', { name: 'Insert' })).not.toBeInTheDocument();
  });

  it('closes the insert panel once an insertion changes the document', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderToolbar(editor);
    await user.click(screen.getByRole('button', { name: 'Insert' }));
    act(() => {
      editor.commands.insertTable({ rows: 2, cols: 2 });
    });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Insert' })).not.toBeInTheDocument(),
    );
  });

  it('shows labeled contextual tools for tables and links', () => {
    editor = createTestEditor(
      '<p><a href="https://example.com">Link</a></p><table><tr><td>Cell</td></tr></table>',
    );
    renderToolbar(editor);
    expect(screen.queryByRole('button', { name: 'Cell fill' })).not.toBeInTheDocument();

    act(() => {
      editor.commands.setTextSelection(2);
    });
    expect(screen.getByText('Link', { selector: 'span' })).toBeVisible();

    let cellPos = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell' && !cellPos) cellPos = pos + 2;
    });
    act(() => {
      editor.commands.setTextSelection(cellPos);
    });
    expect(screen.getByRole('button', { name: 'Table' })).toHaveTextContent('Table');
    expect(screen.getByRole('button', { name: 'Cell fill' })).toHaveTextContent('Cell fill');
  });
});
