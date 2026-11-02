/**
 * A visual line of one text node, as the browser laid it out. `left`/`right`
 * bound the line's non-space characters, so leading and trailing spaces do
 * not shift an anchor.
 */
export interface TextLineRange {
  start: number;
  end: number;
  left: number;
  right: number;
  top: number;
}

export interface TextCharacterBox {
  start: number;
  end: number;
  left: number;
  right: number;
  top: number;
  space: boolean;
}

/**
 * Groups per-character boxes into visual lines. Characters are in logical
 * order, which runs right-to-left in RTL text, so a line must not require the
 * next box to start at or after the previous one; only the vertical position
 * identifies a line break. Bounds ignore spaces so trimming them keeps the
 * anchor on the visible text.
 */
export function groupTextLines(
  characters: TextCharacterBox[],
  fontSize: number,
): TextLineRange[] {
  const lines: TextLineRange[] = [];
  characters.forEach((character) => {
    const current = lines[lines.length - 1];
    if (current && Math.abs(character.top - current.top) < fontSize * 0.5) {
      current.end = character.end;
      if (!character.space) {
        current.left = Math.min(current.left, character.left);
        current.right = Math.max(current.right, character.right);
      }
      return;
    }
    lines.push({
      start: character.start,
      end: character.end,
      left: character.space ? Number.POSITIVE_INFINITY : character.left,
      right: character.space ? Number.NEGATIVE_INFINITY : character.right,
      top: character.top,
    });
  });
  return lines;
}
