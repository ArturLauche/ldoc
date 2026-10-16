import { act, renderHook } from '@testing-library/react';
import { Editor } from '@tiptap/core';
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
