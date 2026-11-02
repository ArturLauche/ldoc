/**
 * A small subset of the Unicode Bidirectional Algorithm, enough for mixed
 * left-to-right and right-to-left paragraphs without a dependency. It assigns
 * embedding levels (0/1/2) to UTF-16 units and reorders a line visually with
 * the standard L2 rule. Combining marks inherit their base character's level;
 * neutrals take the surrounding strong direction, or the paragraph direction
 * when the two sides disagree.
 */

export type BidiDirection = 'ltr' | 'rtl';

const RTL_STRONG =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]/u;
const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const ARABIC_DIGIT = /[\u0660-\u0669\u06f0-\u06f9\u07c0-\u07c9]/u;

type BidiType = 'L' | 'R' | 'EN' | 'AN' | 'N' | 'B';

function typeOf(character: string): BidiType {
  if (character === '\n' || character === '\r' || character === '\u2029') return 'B';
  if (character === '\u200e') return 'L';
  if (character === '\u200f' || character === '\u061c') return 'R';
  if (ARABIC_DIGIT.test(character)) return 'AN';
  if (/\p{Nd}/u.test(character)) return 'EN';
  if (RTL_STRONG.test(character)) return 'R';
  if (LETTER.test(character)) return 'L';
  if (MARK.test(character)) return 'N';
  return 'N';
}

function isStrong(type: BidiType): boolean {
  return type === 'L' || type === 'R';
}

function directionOf(type: BidiType, base: BidiDirection): 'ltr' | 'rtl' {
  if (type === 'L') return 'ltr';
  if (type === 'R' || type === 'EN' || type === 'AN') return 'rtl';
  return base;
}

/** Embedding levels per UTF-16 code unit. */
export function bidiLevels(text: string, base: BidiDirection): number[] {
  const types: BidiType[] = [];
  for (let index = 0; index < text.length; ) {
    const codePoint = text.codePointAt(index) as number;
    const character = String.fromCodePoint(codePoint);
    const type = typeOf(character);
    const units = codePoint > 0xffff ? 2 : 1;
    for (let unit = 0; unit < units; unit += 1) types.push(type);
    index += units;
  }

  // Combining marks follow the preceding character; at the start they follow
  // the paragraph direction.
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] !== 'N' || !MARK.test(text[index] ?? '')) continue;
    types[index] = index > 0 ? types[index - 1] : base === 'rtl' ? 'R' : 'L';
  }

  // Resolve neutral runs between strong text. Numbers count as RTL for this
  // purpose, as in the Unicode algorithm (N1).
  let previous: BidiType = base === 'rtl' ? 'R' : 'L';
  for (let index = 0; index < types.length; ) {
    const type = types[index];
    if (isStrong(type)) {
      previous = type;
      index += 1;
      continue;
    }
    if (type !== 'N') {
      if (type === 'EN' || type === 'AN') previous = 'R';
      index += 1;
      continue;
    }
    let end = index;
    while (end < types.length && types[end] === 'N') end += 1;
    const next = types[end];
    const nextDirection = next === undefined ? base : directionOf(next, base);
    const previousDirection = directionOf(previous, base);
    const resolved: BidiType = previousDirection === nextDirection ? (previousDirection === 'ltr' ? 'L' : 'R') : base === 'rtl' ? 'R' : 'L';
    for (let neutral = index; neutral < end; neutral += 1) types[neutral] = resolved;
    index = end;
  }

  const baseLevel = base === 'rtl' ? 1 : 0;
  const levels: number[] = [];
  let lastStrong: 'L' | 'R' = base === 'rtl' ? 'R' : 'L';
  types.forEach((type, index) => {
    let level: number;
    switch (type) {
      case 'L':
        level = base === 'ltr' ? 0 : 2;
        lastStrong = 'L';
        break;
      case 'R':
        level = 1;
        lastStrong = 'R';
        break;
      case 'AN':
        level = 2;
        break;
      case 'EN':
        // European numbers after RTL text are embedded in the RTL run (level
        // 2); after LTR text they stay left-to-right (level 0).
        level = base === 'rtl' || lastStrong === 'R' ? 2 : 0;
        break;
      case 'B':
        level = baseLevel;
        break;
      default:
        level = baseLevel;
        break;
    }
    levels.push(level);
    // A surrogate pair occupies two units with one direction.
    if (index > 0 && text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff) {
      levels[index] = levels[index - 1];
    }
  });
  return levels;
}

/** Visual order of `items` after applying the bidi L2 reversal rule. */
export function reorderByLevels<T>(items: T[], levels: number[]): T[] {
  const order = items.map((_item, index) => index);
  let highest = 0;
  levels.forEach((level) => {
    if (level > highest) highest = level;
  });
  for (let level = highest; level >= 1; level -= 1) {
    let start = 0;
    while (start < order.length) {
      while (start < order.length && levels[order[start]] < level) start += 1;
      let end = start;
      while (end < order.length && levels[order[end]] >= level) end += 1;
      if (end - start > 1) {
        for (let left = start, right = end - 1; left < right; left += 1, right -= 1) {
          const swap = order[left];
          order[left] = order[right];
          order[right] = swap;
        }
      }
      start = end;
    }
  }
  return order.map((index) => items[index]);
}

export interface DirectionalRun {
  start: number;
  end: number;
  direction: BidiDirection;
}

/** Splits text into runs of one embedding direction, for shaping. */
export function directionalRuns(text: string, base: BidiDirection): DirectionalRun[] {
  const levels = bidiLevels(text, base);
  const runs: DirectionalRun[] = [];
  levels.forEach((level, index) => {
    const direction: BidiDirection = level % 2 ? 'rtl' : 'ltr';
    const last = runs[runs.length - 1];
    if (last && last.direction === direction) last.end = index + 1;
    else runs.push({ start: index, end: index + 1, direction });
  });
  return runs;
}

export function hasRtlText(text: string): boolean {
  return RTL_STRONG.test(text);
}
