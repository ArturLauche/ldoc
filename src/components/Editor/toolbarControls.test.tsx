import { Editor } from '@tiptap/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createEditorExtensions } from './editorExtensions';
import { ColorSwatchGrid, LinkPopover, ToolbarButton } from './toolbarControls';
import { TEXT_COLORS } from './toolbarModel';

function withProviders(ui: React.ReactElement) {
  return render(
    <LocaleProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </LocaleProvider>,
  );
}

describe('toolbar controls', () => {
  let editor: Editor | undefined;
  afterEach(() => editor?.destroy());

  it('links a bare domain typed into the link popover', async () => {
    const user = userEvent.setup();
    editor = new Editor({ extensions: createEditorExtensions(() => ''), content: '<p>Hello world</p>' });
    editor.commands.setTextSelection({ from: 1, to: 6 });
    withProviders(
      <LinkPopover editor={editor} trigger={<button type="button">Link</button>} />,
    );
    await user.click(screen.getByRole('button', { name: 'Link' }));
    await user.type(screen.getByRole('textbox', { name: 'Insert link' }), 'example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(editor!.getHTML()).toMatch(/<a [^>]*href="https:\/\/example\.com\/?"[^>]*>Hello<\/a>/));
  });

  it('marks the current color and offers an automatic color', async () => {
    const user = userEvent.setup();
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p><span style="color: #DC2626">Red</span></p>',
    });
    editor.commands.setTextSelection({ from: 1, to: 4 });
    withProviders(<ColorSwatchGrid editor={editor} kind="text" colors={TEXT_COLORS} current="#DC2626" />);
    expect(screen.getByRole('button', { name: 'Set text color to #DC2626' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Automatic color' }));
    expect(editor.getHTML()).not.toContain('color');
  });

  it('exposes toggle state and the platform shortcut', () => {
    withProviders(
      <ToolbarButton label="Bold" shortcut="Mod+B" pressed>
        B
      </ToolbarButton>,
    );
    const button = screen.getByRole('button', { name: 'Bold' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+B');
  });
});
