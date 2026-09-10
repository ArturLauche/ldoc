import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { loadDocumentFonts } from '@/lib/fonts';

/** Coalesce document-wide traversal during typing; selection changes do no work. */
export function useDocumentStats(editor: Editor | null) {
  const [counts, setCounts] = useState({ wordCount: 0, characterCount: 0 });
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      timer = undefined;
      if (editor.isDestroyed) return;
      const text = editor.getText();
      loadDocumentFonts(editor.state.doc);
      const next = { wordCount: text.match(/\S+/g)?.length ?? 0, characterCount: text.length };
      setCounts((previous) =>
        previous.wordCount === next.wordCount && previous.characterCount === next.characterCount
          ? previous
          : next,
      );
    };
    const schedule = ({ transaction }: { transaction: Transaction }) => {
      if (transaction && !transaction.docChanged) return;
      if (timer === undefined) timer = setTimeout(refresh, 250);
    };
    refresh();
    editor.on('transaction', schedule);
    return () => {
      clearTimeout(timer);
      editor.off('transaction', schedule);
    };
  }, [editor]);
  return counts;
}
