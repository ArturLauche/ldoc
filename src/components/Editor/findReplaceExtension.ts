import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { cycleMatchIndex, findMatchesInText } from '@/lib/findReplace';

export interface DocumentMatch {
  from: number;
  to: number;
}

interface SearchPluginState {
  query: string;
  caseSensitive: boolean;
  activeIndex: number;
  matches: DocumentMatch[];
  decorations: DecorationSet;
}

interface SearchMeta {
  query?: string;
  caseSensitive?: boolean;
  activeIndex?: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findReplace: {
      setSearchQuery: (query: string, caseSensitive?: boolean) => ReturnType;
      clearSearch: () => ReturnType;
      findNextMatch: () => ReturnType;
      findPreviousMatch: () => ReturnType;
      replaceCurrentMatch: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

export const searchPluginKey = new PluginKey<SearchPluginState>('lwrite-find-replace');

/** Collects absolute document positions for every query match in textblocks. */
function findDocumentMatches(
  doc: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): DocumentMatch[] {
  if (!query) return [];

  const matches: DocumentMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;

    // Leaf placeholders keep string offsets aligned with document positions.
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    for (const match of findMatchesInText(text, query, caseSensitive)) {
      matches.push({ from: pos + 1 + match.start, to: pos + 1 + match.end });
    }
    return false;
  });

  return matches;
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: DocumentMatch[],
  activeIndex: number,
): DecorationSet {
  if (!matches.length) return DecorationSet.empty;

  const decorations = matches.map((match, index) =>
    Decoration.inline(match.from, match.to, {
      class: index === activeIndex ? 'search-match search-match--active' : 'search-match',
    }),
  );

  return DecorationSet.create(doc, decorations);
}

function recomputeState(
  state: EditorState,
  query: string,
  caseSensitive: boolean,
  preferredIndex: number,
): SearchPluginState {
  const matches = findDocumentMatches(state.doc, query, caseSensitive);
  const activeIndex = matches.length ? cycleMatchIndex(preferredIndex, matches.length) : 0;

  return {
    query,
    caseSensitive,
    activeIndex,
    matches,
    decorations: buildDecorations(state.doc, matches, activeIndex),
  };
}

const emptySearchState: Omit<SearchPluginState, 'decorations'> & { decorations: DecorationSet } = {
  query: '',
  caseSensitive: false,
  activeIndex: 0,
  matches: [],
  decorations: DecorationSet.empty,
};

export function getSearchState(state: EditorState): SearchPluginState | undefined {
  return searchPluginKey.getState(state);
}

function selectMatch(tr: Transaction, match: DocumentMatch): Transaction {
  return tr
    .setSelection(TextSelection.create(tr.doc, match.from, match.to))
    .scrollIntoView();
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,
        state: {
          init: () => ({ ...emptySearchState }),
          apply: (tr, previous, _oldState, newState) => {
            const meta = tr.getMeta(searchPluginKey) as SearchMeta | undefined;

            if (meta) {
              const query = meta.query ?? previous.query;
              const caseSensitive = meta.caseSensitive ?? previous.caseSensitive;
              const activeIndex = meta.activeIndex ?? previous.activeIndex;
              if (!query) return { ...emptySearchState };
              return recomputeState(newState, query, caseSensitive, activeIndex);
            }

            if (!previous.query) return previous;
            if (!tr.docChanged) return previous;

            return recomputeState(newState, previous.query, previous.caseSensitive, previous.activeIndex);
          },
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearchQuery:
        (query, caseSensitive = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { query, caseSensitive, activeIndex: 0 } satisfies SearchMeta);
          }
          return true;
        },

      clearSearch:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchPluginKey, { query: '' } satisfies SearchMeta);
          }
          return true;
        },

      findNextMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const search = getSearchState(state);
          if (!search?.matches.length) return false;

          if (dispatch) {
            const nextIndex = cycleMatchIndex(search.activeIndex + 1, search.matches.length);
            tr.setMeta(searchPluginKey, { activeIndex: nextIndex } satisfies SearchMeta);
            selectMatch(tr, search.matches[nextIndex]);
          }
          return true;
        },

      findPreviousMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const search = getSearchState(state);
          if (!search?.matches.length) return false;

          if (dispatch) {
            const previousIndex = cycleMatchIndex(search.activeIndex - 1, search.matches.length);
            tr.setMeta(searchPluginKey, { activeIndex: previousIndex } satisfies SearchMeta);
            selectMatch(tr, search.matches[previousIndex]);
          }
          return true;
        },

      replaceCurrentMatch:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const search = getSearchState(state);
          if (!search?.matches.length) return false;

          const match = search.matches[search.activeIndex];
          if (!match) return false;

          if (dispatch) {
            tr.insertText(replacement, match.from, match.to);
            // Keep the same index: the next match slides into this slot.
            tr.setMeta(searchPluginKey, { activeIndex: search.activeIndex } satisfies SearchMeta);
          }
          return true;
        },

      replaceAllMatches:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const search = getSearchState(state);
          if (!search?.matches.length) return false;

          if (dispatch) {
            // Replace from the end so earlier positions stay valid.
            [...search.matches]
              .sort((a, b) => b.from - a.from)
              .forEach((match) => tr.insertText(replacement, match.from, match.to));
            tr.setMeta(searchPluginKey, { activeIndex: 0 } satisfies SearchMeta);
          }
          return true;
        },
    };
  },
});
