import { describe, expect, it } from 'vitest';
import { groupTextLines, type TextCharacterBox } from './textLines';

function box(
  start: number,
  left: number,
  right: number,
  top: number,
  space = false,
): TextCharacterBox {
  return { start, end: start + 1, left, right, top, space };
}

describe('groupTextLines', () => {
  it('groups left-to-right characters on one line', () => {
    const lines = groupTextLines(
      [box(0, 0, 10, 10), box(1, 10, 20, 10), box(2, 20, 24, 10, true), box(3, 24, 34, 10)],
      16,
    );

    expect(lines).toEqual([{ start: 0, end: 4, left: 0, right: 34, top: 10 }]);
  });

  it('groups right-to-left characters on one line', () => {
    // Logical order runs right-to-left: each next character starts further left.
    const lines = groupTextLines(
      [box(0, 90, 100, 10), box(1, 80, 90, 10), box(2, 70, 80, 10)],
      16,
    );

    expect(lines).toEqual([{ start: 0, end: 3, left: 70, right: 100, top: 10 }]);
  });

  it('starts a new line when the vertical position changes', () => {
    const lines = groupTextLines(
      [box(0, 0, 10, 10), box(1, 10, 20, 10), box(2, 0, 10, 34), box(3, 10, 20, 34)],
      16,
    );

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ start: 2, end: 4, left: 0, right: 20, top: 34 });
  });

  it('bounds the line by its visible characters, not leading spaces', () => {
    const lines = groupTextLines(
      [box(0, 0, 4, 10, true), box(1, 4, 8, 10, true), box(2, 8, 18, 10)],
      16,
    );

    expect(lines[0]).toMatchObject({ left: 8, right: 18 });
  });
});
