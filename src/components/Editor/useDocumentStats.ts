import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { loadDocumentFonts } from '@/lib/fonts';
import { countCharacters, countWords } from '@/lib/textStats';

export interface DocumentStats {
  wordCount: number;
  characterCount: number;
  /** Words in a non-empty text selection; `null` without one. */
  selectedWordCount: number | null;
}

const EMPTY: DocumentStats = { wordCount: 0, characterCount: 0, selectedWordCount: null };
/** Document-wide work runs at most this often while typing. */
const REFRESH_MS = 250;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/** Runs work when the main thread is idle (bounded), so counting never delays keystrokes. */
function whenIdle(callback: () => void): () => void {
  const idle = window as IdleWindow;
  if (idle.requestIdleCallback && idle.cancelIdleCallback) {
    const handle = idle.requestIdleCallback(callback, { timeout: 500 });
    return () => idle.cancelIdleCallback?.(handle);
  }
  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}

function same(a: DocumentStats, b: DocumentStats) {
  return (
    a.wordCount === b.wordCount &&
    a.characterCount === b.characterCount &&
    a.selectedWordCount === b.selectedWordCount
  );
}

/**
 * Coalesced document counts (and font discovery), off the typing path:
 * edits schedule one refresh per interval in idle time, and selection
 * changes only recount the selected range.
 */
export function useDocumentStats(editor: Editor | null, locale = 'en'): DocumentStats {
  const [stats, setStats] = useState<DocumentStats>(EMPTY);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelIdle: (() => void) | undefined;
    let documentCounts = { wordCount: 0, characterCount: 0 };

    const selectionWords = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) return null;
      return countWords(editor.state.doc.textBetween(from, to, ' ', ' '), locale);
    };
    const publish = () => {
      const next = { ...documentCounts, selectedWordCount: selectionWords() };
      setStats((previous) => (same(previous, next) ? previous : next));
    };
    const refreshDocument = () => {
      if (editor.isDestroyed) return;
      const text = editor.getText();
      loadDocumentFonts(editor.state.doc);
      documentCounts = { wordCount: countWords(text, locale), characterCount: countCharacters(text) };
      publish();
    };
    const run = (work: () => void) => {
      timer = undefined;
      cancelIdle = whenIdle(() => {
        cancelIdle = undefined;
        if (!editor.isDestroyed) work();
      });
    };
    const schedule = ({ transaction }: { transaction: Transaction }) => {
      if (transaction && !transaction.docChanged) return;
      if (timer === undefined && cancelIdle === undefined) {
        timer = setTimeout(() => run(refreshDocument), REFRESH_MS);
      }
    };
    const onSelection = () => {
      if (timer !== undefined || cancelIdle !== undefined) return; // the pending refresh publishes it
      publish();
    };

    refreshDocument();
    editor.on('transaction', schedule);
    editor.on('selectionUpdate', onSelection);
    return () => {
      clearTimeout(timer);
      cancelIdle?.();
      editor.off('transaction', schedule);
      editor.off('selectionUpdate', onSelection);
    };
  }, [editor, locale]);
  return stats;
}
