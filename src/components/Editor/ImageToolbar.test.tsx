import { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  const tile = () => screen.getAllByRole('button', { name: 'Insert image' })[0];
  const chooseFile = () =>
    fireEvent.change(document.querySelector<HTMLInputElement>('#image-upload')!, {
      target: { files: [new File(['x'], 'pixel.png', { type: 'image/png' })] },
    });
  const dismiss = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  };

  it('previews a chosen file, inserts it on confirmation and hands focus back', async () => {
    const user = userEvent.setup();
    await user.click(tile());
    const insert = screen.getByRole('button', { name: 'Insert image' });
    expect(insert).toBeDisabled();
    chooseFile();
    await act(async () => finishUpload(PIXEL));

    // Nothing is inserted until the user confirms the preview.
    expect(editor.getHTML()).not.toContain('<img');
    expect(await screen.findByText('pixel.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Insert image' }));
    expect(editor.getHTML()).toContain('<img');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['at the start of a paragraph', 1],
    ['inside a paragraph', 3],
    ['at the end of a paragraph', 5],
  ])('keeps the chosen alignment and size for an image inserted %s', async (_where, pos) => {
    const user = userEvent.setup();
    editor.commands.setTextSelection(pos);
    await user.click(tile());
    const dialog = await screen.findByRole('dialog', { name: 'Insert image' });
    await user.click(within(dialog).getByRole('radio', { name: 'Align left' }));
    await user.click(within(dialog).getByRole('radio', { name: '50%' }));
    chooseFile();
    await act(async () => finishUpload(PIXEL));
    await user.click(within(dialog).getByRole('button', { name: 'Insert image' }));

    // The new image is selected, so its own toolbar shows right away.
    expect(editor.isActive('image')).toBe(true);
    expect(editor.getAttributes('image')).toMatchObject({ align: 'left', width: '50', alt: 'pixel.png' });
    expect(editor.state.doc.textContent).toBe('Text');
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
    expect(await screen.findByText('Reading image…')).toBeInTheDocument();
    const toastError = vi.spyOn(toast, 'error');
    await act(async () => failUpload(new Error('unreadable')));
    expect(toastError).toHaveBeenCalledWith('The image could not be read');

    expect(await screen.findByText('Choose an image or drop it here')).toBeInTheDocument();
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

  it('edits a selected image without the insert controls', async () => {
    const user = userEvent.setup();
    editor.commands.setContent(`<img src="${PIXEL}" alt="Old" data-align="center">`);
    editor.commands.setNodeSelection(0);
    await user.click(tile());
    const dialog = await screen.findByRole('dialog', { name: 'Edit image' });
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument();
    const alt = within(dialog).getByRole('textbox', { name: 'Alt text (optional)' });
    expect(alt).toHaveValue('Old');
    await user.clear(alt);
    await user.type(alt, 'New description');
    await user.click(within(dialog).getByRole('radio', { name: 'Align left' }));
    await user.click(within(dialog).getByRole('radio', { name: '50%' }));
    await user.click(within(dialog).getByRole('button', { name: 'Update image' }));
    expect(editor.getAttributes('image')).toMatchObject({
      alt: 'New description',
      align: 'left',
      width: '50',
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
