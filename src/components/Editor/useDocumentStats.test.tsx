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
    expect(hook.result.current).toEqual({ wordCount: 0, characterCount: 0 });
    const live = new Editor({
      extensions: createEditorExtensions(() => ''),
      content: '<p>Two words</p>',
    });
    hook.rerender({ editor: live });
    expect(hook.result.current).toEqual({ wordCount: 2, characterCount: 9 });
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
        vi.advanceTimersByTime(250);
      }),
    ).not.toThrow();
    hook.unmount();
  });
});
