import { Editor, getNodeAttributes, isActive } from '@tiptap/core';
import { NodeSelection, TextSelection, type Selection } from '@tiptap/pm/state';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from './editorExtensions';
import { selectionNodes } from './selectionNodes';

const CONTENT = [
  '<h1 style="text-align: center">Title</h1>',
  '<p>Intro <strong>bold</strong> text</p>',
  '<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li><li><p>Two</p></li></ul>',
  '<blockquote><p style="text-align: right">Quoted</p><h2>Inside</h2></blockquote>',
  '<ol><li><p>First</p></li></ol>',
  '<table><tr><th><p>A</p></th><td><p style="text-align: justify">B</p></td></tr></table>',
  '<pre><code>code()</code></pre>',
  '<p><img src="data:image/png;base64,AA==" alt="x"></p>',
  '<h3>End</h3>',
].join('');

const QUERIES: [string | null, Record<string, unknown>?][] = [
  ['heading', { level: 1 }],
  ['heading', { level: 2 }],
  ['heading', { level: 3 }],
  ['heading'],
  ['paragraph'],
  ['codeBlock'],
  ['blockquote'],
  ['bulletList'],
  ['orderedList'],
  ['listItem'],
  ['table'],
  ['tableCell'],
  ['image'],
  ['smartGraphic'],
  [null, { textAlign: 'left' }],
  [null, { textAlign: 'center' }],
  [null, { textAlign: 'right' }],
  [null, { textAlign: 'justify' }],
];

describe('selectionNodes', () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  it('answers exactly like editor.isActive for every cursor, range and node selection', () => {
    editor = new Editor({ extensions: createEditorExtensions(() => ''), content: CONTENT });
    const { doc } = editor.state;
    const size = doc.content.size;
    const selections: Selection[] = [];
    for (let pos = 0; pos <= size; pos++) {
      selections.push(TextSelection.create(doc, pos));
      for (const span of [1, 3, 9, 30]) {
        if (pos + span <= size) selections.push(TextSelection.create(doc, pos, pos + span));
      }
      const node = doc.nodeAt(pos);
      if (node && NodeSelection.isSelectable(node)) selections.push(NodeSelection.create(doc, pos));
    }
    selections.push(TextSelection.create(doc, 0, size));
    let checked = 0;
    for (const selection of selections) {
      // Plain state application: no plugin can normalize the document between checks.
      const state = editor.state.apply(editor.state.tr.setSelection(selection));
      const nodes = selectionNodes(state);
      for (const [name, attributes] of QUERIES) {
        const expected = isActive(state, name, attributes);
        const label = `${name ?? '*'} ${JSON.stringify(attributes ?? {})} at ${selection.from}-${selection.to}`;
        expect(nodes.isActive(name, attributes), label).toBe(expected);
        checked++;
      }
      for (const name of ['table', 'tableCell', 'tableHeader', 'heading', 'paragraph', 'image']) {
        expect(nodes.attributes(name), `${name} attributes at ${selection.from}-${selection.to}`).toEqual(
          getNodeAttributes(state, name),
        );
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
