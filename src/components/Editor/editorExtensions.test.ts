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

  it('keeps imported tables in the schema without the removed smart diagram node', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(getPlaceholder),
      content: '<table><tr><th>Head</th></tr><tr><td>Cell</td></tr></table>',
    });

    expect(editor.schema.nodes.table).toBeDefined();
    expect(editor.schema.nodes.smartDiagram).toBeUndefined();
    expect(editor.schema.nodes.smartGraphic).toBeDefined();
    expect(editor.getHTML()).toContain('<table');
    expect(editor.getHTML()).toContain('Cell');

    editor.destroy();
  });

  it('keeps caret scrolling clear of the sticky header and docked phone toolbar', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(getPlaceholder),
      content: '<p>Text</p>',
    });
    type Sides = { top: number; bottom: number; left: number; right: number };
    const threshold = () => editor.view.someProp('scrollThreshold') as Sides;
    const header = document.createElement('header');
    header.dataset.scrollInset = 'top';
    Object.defineProperty(header, 'offsetHeight', { value: 48 });
    header.getBoundingClientRect = () => new DOMRect(0, -48, 360, 48);
    const toolbar = document.createElement('div');
    toolbar.dataset.scrollInset = 'bottom';
    toolbar.getBoundingClientRect = () => new DOMRect(0, window.innerHeight - 56, 360, 56);
    document.body.append(header, toolbar);

    // The hidden header (translated above the viewport) still reserves its
    // height, because scrolling up brings it back over the caret.
    expect(threshold().top).toBe(48 + 16);
    expect(threshold().bottom).toBe(56 + 16);
    expect(editor.view.someProp('scrollMargin')).toBe(threshold());

    header.remove();
    toolbar.remove();
    expect(threshold().top).toBe(16);
    expect(threshold().bottom).toBe(16);
    editor.destroy();
  });
});
