import { useEffect, useState } from 'react';
import { getText, getTextSerializersFromSchema } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { fontFamiliesIn, loadFont } from '@/lib/fonts';
import { countCharacters, countWords } from '@/lib/textStats';

export interface DocumentStats {
  wordCount: number;
  characterCount: number;
  /** Words in a non-empty text selection; `null` without one. */
  selectedWordCount: number | null;
}

const EMPTY: DocumentStats = { wordCount: 0, characterCount: 0, selectedWordCount: null };

interface BlockStats {
  words: number;
  characters: number;
  fonts: ReadonlySet<string>;
}
/** Counts refresh once typing pauses this long… */
const REFRESH_MS = 250;
/** …or at least this often during continuous typing. Each refresh re-renders
 * the footer, and every React commit while the editor has focus walks the
 * editable DOM to save the selection, which grows with the document. */
const REFRESH_MAX_WAIT_MS = 2000;

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
 * changes only recount the selected range. A refresh only reads blocks it has
 * not seen: ProseMirror keeps unchanged top-level nodes identical across
 * edits, so their counts come from a cache and typing in a long document
 * recounts one paragraph instead of the whole text.
 */
export function useDocumentStats(editor: Editor | null, locale = 'en'): DocumentStats {
  const [stats, setStats] = useState<DocumentStats>(EMPTY);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelIdle: (() => void) | undefined;
    let documentCounts = { wordCount: 0, characterCount: 0 };
    // Counts depend on the locale (word segmentation), so the cache lives per effect.
    const blockStats = new WeakMap<ProseMirrorNode, BlockStats>();
    const serializers = getTextSerializersFromSchema(editor.schema);
    /** The block's text as editor.getText() renders it (atoms through their serializers). */
    const blockText = (doc: ProseMirrorNode, block: ProseMirrorNode, pos: number, index: number) => {
      const serialize = serializers[block.type.name];
      if (serialize) {
        return serialize({ node: block, pos, parent: doc, index, range: { from: 0, to: doc.content.size } });
      }
      return getText(block, { blockSeparator: '\n\n', textSerializers: serializers });
    };

    const selectionWords = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) return null;
      // A selected graphic or image has no words of its own: show the total.
      const words = countWords(editor.state.doc.textBetween(from, to, ' ', ' '), locale);
      return words > 0 ? words : null;
    };
    const publish = () => {
      const next = { ...documentCounts, selectedWordCount: selectionWords() };
      setStats((previous) => (same(previous, next) ? previous : next));
    };
    const refreshDocument = () => {
      if (editor.isDestroyed) return;
      const { doc } = editor.state;
      let wordCount = 0;
      let characterCount = 0;
      const fonts = new Set<string>();
      doc.forEach((block, pos, index) => {
        let stats = blockStats.get(block);
        if (!stats) {
          const text = blockText(doc, block, pos, index);
          stats = {
            words: countWords(text, locale),
            characters: countCharacters(text),
            fonts: fontFamiliesIn(block),
          };
          blockStats.set(block, stats);
        }
        wordCount += stats.words;
        characterCount += stats.characters;
        stats.fonts.forEach((font) => fonts.add(font));
      });
      fonts.forEach(loadFont);
      documentCounts = { wordCount, characterCount };
      publish();
    };
    const run = (work: () => void) => {
      timer = undefined;
      cancelIdle = whenIdle(() => {
        cancelIdle = undefined;
        if (!editor.isDestroyed) work();
      });
    };
    let firstPendingEditAt = 0;
    const schedule = ({ transaction }: { transaction: Transaction }) => {
      if (transaction && !transaction.docChanged) return;
      if (cancelIdle !== undefined) return; // a refresh already waits for idle time
      const now = Date.now();
      if (timer === undefined) {
        firstPendingEditAt = now;
      } else if (now - firstPendingEditAt < REFRESH_MAX_WAIT_MS) {
        clearTimeout(timer); // still typing: wait for the pause
      } else {
        return; // waited long enough: the pending refresh runs as planned
      }
      timer = setTimeout(() => run(refreshDocument), REFRESH_MS);
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
