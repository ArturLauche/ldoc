import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createEditorExtensions } from './editorExtensions';

const getPlaceholder = () => 'Start writing...';

describe('editorExtensions', () => {
  it('marks font-sized text as theme-inheriting without adding a fixed color', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(getPlaceholder),
      content: '<p><span style="font-size: 24px">Large text</span></p>',
    });

    const doc = new DOMParser().parseFromString(editor.getHTML(), 'text/html');
    const span = doc.querySelector('span');

    expect(span?.getAttribute('data-lwrite-theme-text')).toBe('true');
    expect(span?.getAttribute('style')).toContain('font-size: 24px');
    expect(span?.style.color).toBe('');

    editor.destroy();
  });

  it('marks custom line-height text as theme-inheriting without adding a fixed color', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(getPlaceholder),
      content: '<p><span style="line-height: 1.5">Spaced text</span></p>',
    });

    const doc = new DOMParser().parseFromString(editor.getHTML(), 'text/html');
    const span = doc.querySelector('span');

    expect(span?.getAttribute('data-lwrite-theme-text')).toBe('true');
    expect(span?.getAttribute('style')).toContain('line-height: 1.5');
    expect(span?.style.color).toBe('');

    editor.destroy();
  });
});
