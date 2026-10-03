import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { readFileAsDataUrl } from '@/lib/media';
import { createEditorExtensions } from './editorExtensions';
import { ImageToolbar } from './ImageToolbar';

vi.mock('@/lib/media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media')>()),
  readFileAsDataUrl: vi.fn(),
}));

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('ImageToolbar', () => {
  let editor: Editor;

  afterEach(() => {
    editor?.destroy();
    vi.mocked(readFileAsDataUrl).mockReset();
  });

  it('does not report a completed insert for a later plain dismissal', async () => {
    const user = userEvent.setup();
    let finishUpload: (dataUrl: string) => void = () => {};
    vi.mocked(readFileAsDataUrl).mockImplementation(
      () => new Promise<string>((resolve) => (finishUpload = resolve)),
    );
    const onComplete = vi.fn();
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Text</p>',
    });
    const { container } = render(
      <LocaleProvider>
        <TooltipProvider>
          <ImageToolbar editor={editor} variant="tile" onComplete={onComplete} />
        </TooltipProvider>
      </LocaleProvider>,
    );
    const tile = screen.getByRole('button', { name: 'Insert image' });

    // Dismiss the dialog while an upload is still reading the file.
    await user.click(tile);
    const input = container.ownerDocument.querySelector<HTMLInputElement>('#image-upload')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'pixel.png', { type: 'image/png' })] },
    });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await act(async () => finishUpload(PIXEL));
    expect(editor.getHTML()).toContain('<img');

    // Opening and dismissing again is not an insert.
    await user.click(tile);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onComplete).not.toHaveBeenCalled();
  });
});
