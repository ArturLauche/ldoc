import { NodeSelection, type Transaction } from '@tiptap/pm/state';

/**
 * Position of the first `typeName` node that the transaction's steps from
 * `firstStep` on put into the document. A block inserted at the cursor lands
 * before its text block, after it, or splits it, so this looks where the
 * steps changed the document instead of at the cursor.
 */
export function insertedNodePos(tr: Transaction, firstStep: number, typeName: string): number | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (let index = firstStep; index < tr.steps.length; index++) {
    const later = tr.mapping.slice(index + 1);
    tr.steps[index].getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      from = Math.min(from, later.map(newStart, -1));
      to = Math.max(to, later.map(newEnd, 1));
    });
  }
  let found: number | null = null;
  if (from > to) return found;
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== typeName) return true;
    found = pos;
    return false;
  });
  return found;
}

/**
 * Selects the node those steps inserted, so its contextual toolbar shows
 * right away. False when the insertion did not happen.
 */
export function selectInsertedNode(
  tr: Transaction,
  firstStep: number,
  typeName: string,
  dispatch: unknown,
): boolean {
  const pos = insertedNodePos(tr, firstStep, typeName);
  if (pos === null) return false;
  if (dispatch) tr.setSelection(NodeSelection.create(tr.doc, pos));
  return true;
}
