import { beforeEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { createEditorExtensions } from '@/components/Editor/editorExtensions';
import { loadDocumentFonts, loadFont } from './fonts';

beforeEach(() =>
  document.head.querySelectorAll('[data-editor-font]').forEach((node) => node.remove()),
);
describe('self-hosted editor fonts', () => {
  it('loads every known font in a restored document without waiting for selection', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content:
        '<p><span style="font-family: Lora">One</span><span style="font-family: Inter">Two</span></p>',
    });
    loadDocumentFonts(editor.state.doc);
    expect(document.querySelector('link[href="/fonts/lora.css"]')).not.toBeNull();
    expect(document.querySelector('link[href="/fonts/inter.css"]')).not.toBeNull();
    editor.destroy();
  });
  it('deduplicates requests and never requests a made-up font path', () => {
    loadFont('Lora');
    loadFont('Lora');
    loadFont('../../tracking');
    expect(document.head.querySelectorAll('[data-editor-font]')).toHaveLength(1);
  });
});
