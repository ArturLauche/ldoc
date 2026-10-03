import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  describe('caret scrolling around editor chrome', () => {
    type Sides = { top: number; bottom: number; left: number; right: number };
    // Measurements are shared by the reads of one scroll-into-view.
    const nextMeasurement = () => Promise.resolve();
    let editor: Editor;
    let header: HTMLElement;
    let toolbar: HTMLElement;

    const sides = (prop: 'scrollThreshold' | 'scrollMargin') => {
      const value = editor.view.someProp(prop) as Sides;
      return { top: value.top, bottom: value.bottom, left: value.left, right: value.right };
    };

    beforeEach(() => {
      editor = new Editor({
        extensions: createEditorExtensions(getPlaceholder),
        content: '<p>Text</p>',
      });
      header = document.createElement('header');
      header.dataset.scrollInset = 'top';
      Object.defineProperty(header, 'offsetHeight', { value: 48 });
      // Hidden: translated above the viewport.
      header.getBoundingClientRect = () => new DOMRect(0, -48, 360, 48);
      toolbar = document.createElement('div');
      toolbar.dataset.scrollInset = 'bottom';
      toolbar.getBoundingClientRect = () => new DOMRect(0, window.innerHeight - 56, 360, 56);
      document.body.append(header, toolbar);
    });

    afterEach(() => {
      header.remove();
      toolbar.remove();
      editor.destroy();
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    });

    it('keeps the caret clear of the sticky header and docked phone toolbar', async () => {
      // The hidden header still reserves its height, because scrolling up
      // brings it back over the caret.
      const expected = { top: 48 + 16, bottom: 56 + 16, left: 16, right: 16 };
      expect(sides('scrollThreshold')).toEqual(expected);
      expect(sides('scrollMargin')).toEqual(expected);

      header.remove();
      toolbar.remove();
      await nextMeasurement();
      expect(sides('scrollThreshold')).toEqual({ top: 16, bottom: 16, left: 16, right: 16 });
    });

    it('measures against a software keyboard and caps the reserved space', async () => {
      const visibleHeight = window.innerHeight - 300;
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: { height: visibleHeight, offsetTop: 20, scale: 1 },
      });
      // Docked to the top of the keyboard in a panned visual viewport.
      toolbar.getBoundingClientRect = () => new DOMRect(0, 20 + visibleHeight - 56, 360, 56);
      await nextMeasurement();
      expect(sides('scrollThreshold').bottom).toBe(56 + 16);

      // A panel taller than half the visible area must not push the caret off-screen.
      toolbar.getBoundingClientRect = () => new DOMRect(0, 40, 360, visibleHeight - 20);
      await nextMeasurement();
      expect(sides('scrollThreshold').bottom).toBe(visibleHeight / 2 + 16);

      // Hidden chrome reserves nothing.
      toolbar.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
      await nextMeasurement();
      expect(sides('scrollMargin').bottom).toBe(16);
    });
  });
});
