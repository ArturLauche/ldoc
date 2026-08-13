import { Editor } from '@tiptap/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createEditorExtensions } from './editorExtensions';
import { TableGridPicker } from './TableGridPicker';
import { TableToolbar } from './TableToolbar';

function renderWithProviders(ui: ReactElement) {
  return render(
    <LocaleProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </LocaleProvider>,
  );
}

function createTestEditor(content = '<p></p>') {
  return new Editor({
    extensions: createEditorExtensions(() => 'Start writing...'),
    content,
  });
}

describe('table insert and tools', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
  });

  it('inserts a table from the visual grid picker', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderWithProviders(<TableGridPicker editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    await user.click(screen.getByTestId('table-picker-cell-3-4'));

    const html = editor.getHTML();
    expect(html).toContain('<table');
    expect(html.match(/<tr/g)?.length).toBe(3);
    expect(html).toContain('<th');
  });

  it('inserts a rounded custom size and ignores empty custom fields', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderWithProviders(<TableGridPicker editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    const rowInput = screen.getByLabelText('Rows');
    const colInput = screen.getByLabelText('Columns');
    await user.clear(rowInput);
    await user.type(rowInput, '2.7');
    await user.clear(colInput);
    await user.type(colInput, '1e1');
    await user.click(screen.getByRole('button', { name: 'Insert custom size' }));

    expect(editor.getHTML().match(/<tr/g)?.length).toBe(3);
    expect(editor.getHTML().match(/<th/g)?.length).toBe(10);

    await user.click(screen.getByRole('button', { name: 'Insert table' }));
    await user.clear(screen.getByLabelText('Rows'));
    expect(screen.getByRole('button', { name: 'Insert custom size' })).toBeDisabled();
  });

  it('disables merge when a single cell is selected and supports row actions', () => {
    editor = createTestEditor();
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false });

    expect(editor.can().addRowAfter()).toBe(true);
    expect(editor.can().mergeCells()).toBe(false);

    editor.commands.addRowAfter();
    expect(editor.getHTML().match(/<tr/g)?.length).toBe(3);

    editor.commands.setCellAttribute('backgroundColor', '#FEF08A');
    expect(editor.getHTML()).toContain('background-color');

    renderWithProviders(<TableToolbar editor={editor} />);
    expect(screen.getByRole('button', { name: 'Table' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell fill' })).toBeInTheDocument();
  });

  it('keeps imported tables editable in the schema', () => {
    editor = createTestEditor('<table><tr><th>Head</th></tr><tr><td>Cell</td></tr></table>');
    expect(editor.getHTML()).toContain('Head');
    expect(editor.getHTML()).toContain('Cell');
    expect(editor.can().addColumnAfter()).toBe(true);
  });
});
