import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';

interface NodeRange {
  node: ProseMirrorNode;
  from: number;
  to: number;
}

/**
 * The non-text nodes the selection touches, with the part of each that it
 * covers: the same set TipTap's `isNodeActive` collects with
 * `doc.nodesBetween(from, to)`. That walk starts at the first block of the
 * document, though, so a toolbar asking a dozen questions per keystroke
 * re-walked every block above the cursor each time. Blocks before the one
 * holding `from` cannot touch the selection, so this starts there.
 */
function selectionNodeRanges(state: EditorState): NodeRange[] {
  const { from, to, $from } = state.selection;
  const { doc } = state;
  const ranges: NodeRange[] = [];
  const collect = (node: ProseMirrorNode, pos: number) => {
    if (node.isText) return;
    ranges.push({ node, from: Math.max(from, pos), to: Math.min(to, pos + node.nodeSize) });
  };
  // Start of the top-level block holding `from` (a depth-0 position sits
  // right before the block at its index).
  let pos = $from.depth > 0 ? $from.before(1) : $from.pos;
  for (let index = $from.index(0); index < doc.childCount && pos < to; index++) {
    const child = doc.child(index);
    const end = pos + child.nodeSize;
    if (end > from) {
      collect(child, pos);
      if (child.content.size) {
        const start = pos + 1;
        child.nodesBetween(
          Math.max(0, from - start),
          Math.min(child.content.size, to - start),
          (node, nodePos) => collect(node, nodePos),
          start,
        );
      }
    }
    pos = end;
  }
  return ranges;
}

export interface SelectionNodes {
  /**
   * `editor.isActive(nodeName, attributes)` for node types, and
   * `isActive({ attribute })` for node attributes (typeName null), with
   * TipTap's semantics: an empty selection matches any ancestor; a range
   * must be covered by matching nodes.
   */
  isActive: (typeName: string | null, attributes?: Record<string, unknown>) => boolean;
  /** `editor.getAttributes(nodeName)`: the last such node the selection touches. */
  attributes: (typeName: string) => Record<string, unknown>;
  /** The last node of that type the selection touches (the innermost for a cursor). */
  node: (typeName: string) => ProseMirrorNode | undefined;
  /** Every text block (paragraph, heading, code block) the selection touches. */
  textblocks: () => ProseMirrorNode[];
}

/** Node questions about the selection, answered from one walk over it. */
export function selectionNodes(state: EditorState): SelectionNodes {
  const ranges = selectionNodeRanges(state);
  const { from, to, empty } = state.selection;
  return {
    isActive: (typeName, attributes = {}) => {
      const keys = Object.keys(attributes);
      const matched = ranges.filter(
        ({ node }) =>
          (!typeName || node.type.name === typeName) &&
          keys.every((key) => node.attrs[key] === attributes[key]),
      );
      if (empty) return matched.length > 0;
      return matched.reduce((sum, range) => sum + range.to - range.from, 0) >= to - from;
    },
    attributes: (typeName) => {
      const node = lastOfType(ranges, typeName);
      return node ? { ...node.attrs } : {};
    },
    node: (typeName) => lastOfType(ranges, typeName),
    textblocks: () => ranges.filter(({ node }) => node.isTextblock).map(({ node }) => node),
  };
}

function lastOfType(ranges: NodeRange[], typeName: string): ProseMirrorNode | undefined {
  for (let index = ranges.length - 1; index >= 0; index--) {
    if (ranges[index].node.type.name === typeName) return ranges[index].node;
  }
  return undefined;
}
