import { Editor } from '@tiptap/core';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions, DEFAULT_HIGHLIGHT_COLOR } from './editorExtensions';
import { applyTextBlockStyle, HIGHLIGHT_COLORS, normalizeColor, useToolbarState } from './toolbarModel';

let editor: Editor;
afterEach(() => editor?.destroy());

function stateFor(html: string, from: number, to = from) {
  editor = new Editor({ extensions: createEditorExtensions(() => ''), content: html });
  editor.commands.setTextSelection({ from, to });
  const { result } = renderHook(() => useToolbarState(editor));
  return result.current;
}

describe('toolbar colors', () => {
  it('reads stored rgb() colors as the palette hex values', () => {
    expect(normalizeColor('rgb(220, 38, 38)')).toBe('#DC2626');
    expect(normalizeColor('rgba(0, 0, 0, 1)')).toBe('#000000');
    expect(normalizeColor('#2563EB')).toBe('#2563EB');
    expect(normalizeColor('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)');
    // A reloaded document keeps the color as the browser serialized it.
    expect(stateFor('<p><span style="color: rgb(220, 38, 38)">Red</span></p>', 2)?.textColor).toBe('#DC2626');
  });

  it('treats a highlight without a color as highlighted', () => {
    expect(stateFor('<p><mark>Hello</mark> world</p>', 3)?.highlightColor).toBe('#FFFF00');
    expect(stateFor('<p>Hello world</p>', 3)?.highlightColor).toBeUndefined();
  });

  it('highlights with the first palette color from the keyboard', () => {
    stateFor('<p>Hello world</p>', 1, 6);
    editor.commands.keyboardShortcut('Mod-Shift-h');
    expect(editor.getAttributes('highlight').color).toBe(DEFAULT_HIGHLIGHT_COLOR);
    expect(HIGHLIGHT_COLORS[1]).toBe(DEFAULT_HIGHLIGHT_COLOR);
  });
});

describe('toolbar alignment', () => {
  it('starts unaligned blocks on the side the document reads from', () => {
    expect(stateFor('<p>Plain text</p>', 3)?.alignment).toBe('left');
    expect(stateFor('<p>مرحبا بالعالم</p>', 3)?.alignment).toBe('right');
  });

  it('reads the alignment of selected list items, not their wrappers', () => {
    const html = '<ul><li><p style="text-align: center">One</p></li><li><p style="text-align: center">Two</p></li></ul>';
    expect(stateFor(html, 4, 12)?.alignment).toBe('center');
  });

  it('reports no alignment when the selected blocks differ', () => {
    const html = '<p style="text-align: center">One</p><p style="text-align: right">Two</p>';
    expect(stateFor(html, 2, 8)?.alignment).toBeUndefined();
  });
});

describe('text block styles', () => {
  const apply = (html: string, pos: number, style: Parameters<typeof applyTextBlockStyle>[1]) => {
    editor = new Editor({ extensions: createEditorExtensions(() => ''), content: html });
    editor.commands.setTextSelection(pos);
    applyTextBlockStyle(editor, style);
    // The editor keeps an empty paragraph after a final quote or list.
    return editor.getHTML().replace(/<p><\/p>$/, '');
  };

  it('turns a quoted heading or code block into a quoted paragraph', () => {
    expect(apply('<blockquote><h1>Title</h1></blockquote>', 3, 'blockquote')).toBe(
      '<blockquote><p>Title</p></blockquote>',
    );
    expect(apply('<blockquote><pre><code>x = 1</code></pre></blockquote>', 3, 'blockquote')).toBe(
      '<blockquote><p>x = 1</p></blockquote>',
    );
  });

  it('quotes a paragraph and unquotes it again', () => {
    expect(apply('<p>Words</p>', 2, 'blockquote')).toBe('<blockquote><p>Words</p></blockquote>');
    expect(apply('<blockquote><p>Words</p></blockquote>', 3, 'blockquote')).toBe('<p>Words</p>');
  });

  it('leaves the quote, not the list inside it, for other styles', () => {
    expect(apply('<blockquote><ul><li><p>item</p></li></ul></blockquote>', 5, 'paragraph')).toBe(
      '<ul><li><p>item</p></li></ul>',
    );
    expect(apply('<blockquote><blockquote><p>deep</p></blockquote></blockquote>', 4, 'h2')).toBe('<h2>deep</h2>');
  });
});
