import { act, renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorExtensions } from './editorExtensions';
import { useDocumentStats } from './useDocumentStats';

afterEach(() => vi.useRealTimers());

describe('document statistics lifecycle', () => {
  it('waits for a live editor when a suspended render received a disposed instance', () => {
    const disposed = new Editor({ extensions: createEditorExtensions(() => '') });
    disposed.destroy();
    const hook = renderHook(({ editor }) => useDocumentStats(editor), {
      initialProps: { editor: disposed },
    });
    expect(hook.result.current).toEqual({ wordCount: 0, characterCount: 0, selectedWordCount: null });
    const live = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Two words</p>',
    });
    hook.rerender({ editor: live });
    expect(hook.result.current).toEqual({ wordCount: 2, characterCount: 9, selectedWordCount: null });
    hook.unmount();
    live.destroy();
  });

  it('does not traverse an editor destroyed while a count refresh is queued', () => {
    vi.useFakeTimers();
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Initial</p>',
    });
    const hook = renderHook(() => useDocumentStats(editor));
    act(() => {
      editor.commands.insertContent('Changed');
    });
    editor.destroy();
    expect(() =>
      act(() => {
        vi.advanceTimersByTime(1000);
      }),
    ).not.toThrow();
    hook.unmount();
  });

  it('counts the selected words without a document traversal', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>one two three four</p>',
    });
    const hook = renderHook(() => useDocumentStats(editor));
    expect(hook.result.current.wordCount).toBe(4);
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 8 });
    });
    expect(hook.result.current.selectedWordCount).toBe(2);
    act(() => {
      editor.commands.setTextSelection(3);
    });
    expect(hook.result.current.selectedWordCount).toBeNull();
    // Only spaces or a node without text selected: the footer keeps the total.
    act(() => {
      editor.commands.setContent('<p>one</p><hr><p>two</p>');
      editor.commands.setNodeSelection(5);
    });
    expect(editor.state.selection.empty).toBe(false);
    expect(hook.result.current.selectedWordCount).toBeNull();
    hook.unmount();
    editor.destroy();
  });

  it('counts a selection the way it counts the document', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content:
        '<table><tr><td><p>alpha</p></td><td><p>beta gamma</p></td></tr>' +
        '<tr><td><p>delta epsilon zeta</p></td><td><p>eta theta iota kappa</p></td></tr></table><p>end</p>',
    });
    const hook = renderHook(() => useDocumentStats(editor));
    expect(hook.result.current.wordCount).toBe(11);

    // Every selected cell counts, not only the selection's first range.
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') cells.push(pos);
    });
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[0], cells[3])),
      );
    });
    expect(hook.result.current.selectedWordCount).toBe(10);
    act(() => {
      editor.view.dispatch(
        editor.state.tr.setSelection(CellSelection.create(editor.state.doc, cells[1], cells[3])),
      );
    });
    expect(hook.result.current.selectedWordCount).toBe(6);
    hook.unmount();
    editor.destroy();
  });

  it('counts graphic text and mixed scripts in Select All like the total', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Send an e-mail to bob@example.com about re-use</p><p>日本語</p>',
    });
    editor.commands.focus('end');
    editor.commands.insertSmartGraphic('list-block', 'en');
    const hook = renderHook(() => useDocumentStats(editor));
    act(() => {
      editor.commands.selectAll();
    });
    expect(hook.result.current.selectedWordCount).toBe(hook.result.current.wordCount);
    hook.unmount();
    editor.destroy();
  });

  it('counts every block, including list items, tables and graphics, without separators', () => {
    vi.useFakeTimers();
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content:
        '<h1>Big title</h1><p>one two<br>three</p><ul><li><p>four</p></li><li><p>five six</p></li></ul>' +
        '<table><tr><td><p>seven</p></td><td><p>eight</p></td></tr></table>',
    });
    editor.commands.focus('end');
    editor.commands.insertSmartGraphic('list-block', 'en');
    const hook = renderHook(() => useDocumentStats(editor));
    // The same total as counting the whole text at once (graphic labels included).
    const expectedWords = editor.getText().match(/\S+/g)?.length ?? 0;
    expect(expectedWords).toBeGreaterThan(10);
    expect(hook.result.current.wordCount).toBe(expectedWords);
    // Characters with spaces, without paragraph or line breaks.
    const visible = editor.getText().replace(/[\n\r]/g, '');
    expect(hook.result.current.characterCount).toBe([...visible].length);

    // Typing changes only the edited block; the cached blocks still count.
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.resolve(3).pos);
      editor.commands.insertContent('very ');
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook.result.current.wordCount).toBe(expectedWords + 1);
    expect(hook.result.current.characterCount).toBe([...visible].length + 5);
    hook.unmount();
    editor.destroy();
  });

  it('refreshes after a typing pause, and at least every two seconds while typing', () => {
    vi.useFakeTimers();
    const editor = new Editor({ extensions: createEditorExtensions(() => ''), content: '<p>start</p>' });
    const hook = renderHook(() => useDocumentStats(editor));
    expect(hook.result.current.wordCount).toBe(1);
    const typeWord = () =>
      act(() => {
        editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' word');
        vi.advanceTimersByTime(100);
      });

    // Continuous typing: no refresh before the two-second cap…
    for (let i = 0; i < 15; i++) typeWord();
    expect(hook.result.current.wordCount).toBe(1);
    // …but one shortly after it, even though typing goes on.
    for (let i = 0; i < 8; i++) typeWord();
    expect(hook.result.current.wordCount).toBeGreaterThan(1);

    // A pause publishes the final count.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook.result.current.wordCount).toBe(24);
    hook.unmount();
    editor.destroy();
  });

  it('counts words in scripts without spaces', () => {
    const editor = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>我喜欢这个编辑器</p>',
    });
    const hook = renderHook(() => useDocumentStats(editor, 'zh'));
    expect(hook.result.current.wordCount).toBeGreaterThan(1);
    hook.unmount();
    editor.destroy();
  });
});
