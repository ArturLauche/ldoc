import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { toast } from 'sonner';
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

describe('ImageToolbar uploads', () => {
  let editor: Editor;
  let finishUpload: (dataUrl: string) => void;
  let failUpload: (error: Error) => void;
  let unmount: () => void;
  let onComplete: Mock<() => void>;

  beforeEach(() => {
    finishUpload = () => {};
    failUpload = () => {};
    vi.mocked(readFileAsDataUrl).mockImplementation(
      () =>
        new Promise<string>((resolve, reject) => {
          finishUpload = resolve;
          failUpload = reject;
        }),
    );
    onComplete = vi.fn<() => void>();
    editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Text</p>',
    });
    ({ unmount } = render(
      <LocaleProvider>
        <TooltipProvider>
          <ImageToolbar editor={editor} variant="tile" onComplete={onComplete} />
        </TooltipProvider>
      </LocaleProvider>,
    ));
  });

  afterEach(() => {
    editor.destroy();
    vi.mocked(readFileAsDataUrl).mockReset();
    vi.restoreAllMocks();
  });

  const tile = () => screen.getByRole('button', { name: 'Insert image' });
  const chooseFile = () =>
    fireEvent.change(document.querySelector<HTMLInputElement>('#image-upload')!, {
      target: { files: [new File(['x'], 'pixel.png', { type: 'image/png' })] },
    });
  const dismiss = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  };

  it('inserts a finished upload and hands focus back to the document', async () => {
    const user = userEvent.setup();
    await user.click(tile());
    chooseFile();
    await act(async () => finishUpload(PIXEL));

    expect(editor.getHTML()).toContain('<img');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('cancels an upload when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    await user.click(tile());
    chooseFile();
    await dismiss(user);
    await act(async () => finishUpload(PIXEL));
    expect(editor.getHTML()).not.toContain('<img');

    // A later plain dismissal is not a completed insert either.
    await user.click(tile());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await dismiss(user);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('lets the user retry after a failed read', async () => {
    const user = userEvent.setup();
    await user.click(tile());
    chooseFile();
    expect(await screen.findByText('Uploading...')).toBeInTheDocument();
    const toastError = vi.spyOn(toast, 'error');
    await act(async () => failUpload(new Error('unreadable')));
    expect(toastError).toHaveBeenCalledWith('Failed to upload image');

    expect(await screen.findByText('Click to upload or drag and drop')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(editor.getHTML()).not.toContain('<img');
  });

  it('stays silent when a cancelled read fails or the toolbar unmounts', async () => {
    const user = userEvent.setup();
    await user.click(tile());
    chooseFile();
    await dismiss(user);
    const toastError = vi.spyOn(toast, 'error');
    await act(async () => failUpload(new Error('unreadable')));
    expect(toastError).not.toHaveBeenCalled();

    await user.click(tile());
    await screen.findByRole('dialog');
    chooseFile();
    unmount();
    await act(async () => finishUpload(PIXEL));
    expect(editor.getHTML()).not.toContain('<img');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('keeps a reopened dialog open when a cancelled upload finishes', async () => {
    const user = userEvent.setup();
    await user.click(tile());
    chooseFile();
    await dismiss(user);

    await user.click(tile());
    const dialog = await screen.findByRole('dialog');
    await user.click(screen.getByRole('tab', { name: 'URL' }));
    const url = screen.getByRole('textbox', { name: 'Image URL' });
    await user.type(url, 'example.com/photo.png');
    await act(async () => finishUpload(PIXEL));

    expect(dialog).toBeInTheDocument();
    expect(url).toHaveValue('example.com/photo.png');
    expect(editor.getHTML()).not.toContain('<img');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
