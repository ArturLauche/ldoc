import { Editor } from '@tiptap/core';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorExtensions } from './editorExtensions';
import { IMAGE_FILE_ERROR_EVENT } from './imageFileExtension';

const IMAGE_FILES_PLUGIN = 'imageFiles$';

const PNG_BYTES = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (char) => char.charCodeAt(0),
);

function setup(content = '<p>Hello</p>') {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({ element, extensions: createEditorExtensions(() => ''), content });
  const plugin = editor.state.plugins.find((candidate) =>
    (candidate as unknown as { key: string }).key.startsWith(IMAGE_FILES_PLUGIN),
  )!;
  return { editor, element, props: plugin.props };
}

const image = (name = 'shot.png') => new File([PNG_BYTES], name, { type: 'image/png' });

describe('pasted and dropped image files', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('inserts a pasted screenshot at the cursor', async () => {
    const { editor, element, props } = setup();
    cleanup = () => {
      editor.destroy();
      element.remove();
    };
    const preventDefault = vi.fn();
    const handled = props.handlePaste?.call(
      undefined as never,
      editor.view,
      { clipboardData: { files: [image()], getData: () => '' }, preventDefault } as unknown as ClipboardEvent,
      undefined as never,
    );
    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(editor.getHTML()).toMatch(/<img[^>]+src="data:image\/png;base64,/));
    expect(editor.getHTML()).toContain('alt="shot.png"');
  });

  it('keeps every pasted image at the end of the document and the cursor after them', async () => {
    const { editor, element, props } = setup('<p>Hello</p>');
    cleanup = () => {
      editor.destroy();
      element.remove();
    };
    editor.commands.setTextSelection(6);
    const paste = (files: File[]) =>
      props.handlePaste?.call(
        undefined as never,
        editor.view,
        { clipboardData: { files, getData: () => '' }, preventDefault: vi.fn() } as unknown as ClipboardEvent,
        undefined as never,
      );
    paste([image('one.png'), image('two.png')]);
    await waitFor(() => expect(editor.getHTML().match(/<img/g)).toHaveLength(2));
    // A second paste and typing go after the images instead of replacing one.
    paste([image('three.png')]);
    await waitFor(() => expect(editor.getHTML().match(/<img/g)).toHaveLength(3));
    editor.commands.insertContent('Caption');
    const html = editor.getHTML();
    expect(html.indexOf('one.png')).toBeLessThan(html.indexOf('two.png'));
    expect(html.indexOf('two.png')).toBeLessThan(html.indexOf('three.png'));
    expect(html).toMatch(/three\.png"[^>]*><p>Caption<\/p>$/);
  });

  it('leaves copied text with images to the normal paste', () => {
    const { editor, element, props } = setup();
    cleanup = () => {
      editor.destroy();
      element.remove();
    };
    const handled = props.handlePaste?.call(
      undefined as never,
      editor.view,
      {
        clipboardData: { files: [image()], getData: (type: string) => (type === 'text/plain' ? 'words' : '') },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent,
      undefined as never,
    );
    expect(handled).toBe(false);
  });

  it('inserts dropped images in order and refuses other files', async () => {
    const { editor, element, props } = setup();
    const errors: string[] = [];
    const onError = (event: Event) => errors.push((event as CustomEvent<string>).detail);
    document.addEventListener(IMAGE_FILE_ERROR_EVENT, onError);
    cleanup = () => {
      document.removeEventListener(IMAGE_FILE_ERROR_EVENT, onError);
      editor.destroy();
      element.remove();
    };
    const drop = (files: File[]) =>
      props.handleDrop?.call(
        undefined as never,
        editor.view,
        {
          dataTransfer: { types: ['Files'], files },
          clientX: 0,
          clientY: 0,
          preventDefault: vi.fn(),
        } as unknown as DragEvent,
        undefined as never,
        false,
      );

    expect(drop([new File(['x'], 'notes.docx', { type: 'application/zip' })])).toBe(true);
    expect(errors).toEqual(['not-image-drop']);

    expect(drop([image('one.png'), image('two.png')])).toBe(true);
    await waitFor(() => expect(editor.getHTML().match(/<img/g)).toHaveLength(2));
    const html = editor.getHTML();
    expect(html.indexOf('one.png')).toBeLessThan(html.indexOf('two.png'));
  });
});
