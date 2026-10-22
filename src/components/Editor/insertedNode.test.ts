import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from './editorExtensions';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('insert commands that select what they insert', () => {
  let editor: Editor;
  afterEach(() => editor.destroy());

  it('report that they can run without changing the document', () => {
    editor = new Editor({ extensions: createEditorExtensions(() => ''), content: '<p>Text</p>' });
    editor.commands.setTextSelection(5);
    const before = editor.getJSON();
    expect(editor.can().insertImage({ src: PIXEL, alt: 'Pixel', align: 'left', width: '50' })).toBe(true);
    expect(editor.can().insertSmartGraphic('list-block')).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.from).toBe(5);

    expect(editor.commands.insertImage({ src: PIXEL, alt: 'Pixel', align: 'left', width: '50' })).toBe(true);
    expect(editor.isActive('image')).toBe(true);
  });
});
