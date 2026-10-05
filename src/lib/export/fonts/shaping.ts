import { rangesContain } from './faces';
import type { FaceResolution, LoadedFont } from './registry';

/**
 * Text shaping for exports that position glyphs themselves (PDF, outlined
 * SVG). Fonts are chosen per grapheme like a browser does: the family's
 * unicode-range subsets first, then the Noto Sans fallback, then "missing".
 */

export interface ShapedGlyph {
  id: number;
  /** Font units. */
  advance: number;
  xOffset: number;
  yOffset: number;
  /** UTF-16 offset of the cluster this glyph starts (relative to the run text). */
  cluster: number;
}

export interface ShapedSegment {
  /** null when no available font has the characters. */
  font: LoadedFont | null;
  text: string;
  /** UTF-16 range in the shaped string. */
  start: number;
  end: number;
  glyphs: ShapedGlyph[];
  /** Cluster boundaries (UTF-16 offsets, relative to the run) with their advance in font units. */
  clusters: Array<{ start: number; end: number; advance: number }>;
}

// Grapheme clusters without Intl.Segmenter: a base character with combining
// marks, variation selectors, skin tones, and ZWJ-joined emoji sequences.
const GRAPHEME =
  /\r\n|\p{RI}\p{RI}|(?:\P{M}|\p{M})(?:\p{M}|\uFE0F|\uFE0E|\p{Emoji_Modifier}|\u200D(?:\p{Extended_Pictographic}|\p{Emoji}))*|[\s\S]/gu;

export function splitGraphemes(text: string): string[] {
  return text.match(GRAPHEME) ?? [];
}

// Characters a font may lack without the browser switching fonts for them.
function isIgnorable(codePoint: number): boolean {
  return (codePoint >= 0x200b && codePoint <= 0x200f) || codePoint === 0x2060 || (codePoint >= 0xfe00 && codePoint <= 0xfe0f) || codePoint === 0xad;
}

function fontCovers(font: LoadedFont, grapheme: string): boolean {
  for (const char of grapheme) {
    const codePoint = char.codePointAt(0) as number;
    if (isIgnorable(codePoint)) continue;
    if (!rangesContain(font.ranges, codePoint) || !font.font.hasGlyphForCodePoint(codePoint)) return false;
  }
  return true;
}

export function pickFont(
  grapheme: string,
  resolution: FaceResolution,
  fallback: LoadedFont | null,
): LoadedFont | null {
  for (const font of resolution.fonts) {
    if (fontCovers(font, grapheme)) return font;
  }
  if (/^\s+$/u.test(grapheme) && resolution.fonts[0]) return resolution.fonts[0];
  if (fallback && fontCovers(fallback, grapheme)) return fallback;
  return null;
}

/**
 * ProseMirror's stylesheet sets `font-variant-ligatures: none` on the
 * document, so the editor never forms ligatures (not even Fira Code's `=>`).
 */
const NO_LIGATURES: Record<string, boolean> = { liga: false, clig: false, calt: false, dlig: false, hlig: false };

/** Splits `text` into runs of one font each and shapes them with OpenType features. */
export function shapeText(text: string, resolution: FaceResolution, fallback: LoadedFont | null): ShapedSegment[] {
  const segments: ShapedSegment[] = [];
  let offset = 0;
  let current: { font: LoadedFont | null; start: number; end: number } | null = null;
  const flush = () => {
    if (!current) return;
    segments.push(shapeSegment(text.slice(current.start, current.end), current.font, current.start));
    current = null;
  };
  splitGraphemes(text).forEach((grapheme) => {
    const font = pickFont(grapheme, resolution, fallback);
    if (current && current.font === font) {
      current.end += grapheme.length;
    } else {
      flush();
      current = { font, start: offset, end: offset + grapheme.length };
    }
    offset += grapheme.length;
  });
  flush();
  return segments;
}

function shapeSegment(text: string, font: LoadedFont | null, start: number): ShapedSegment {
  if (!font) {
    const clusters = splitGraphemes(text).reduce<Array<{ start: number; end: number; advance: number }>>((all, grapheme) => {
      const from = all.length ? all[all.length - 1].end : start;
      all.push({ start: from, end: from + grapheme.length, advance: 0 });
      return all;
    }, []);
    return { font: null, text, start, end: start + text.length, glyphs: [], clusters };
  }
  const run = font.font.layout(text, NO_LIGATURES);
  const glyphs: ShapedGlyph[] = [];
  const clusterAdvance = new Map<number, number>();
  let cursor = 0;
  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index];
    const cluster = Math.min(cursor, text.length);
    glyphs.push({
      id: glyph.id,
      advance: position.xAdvance,
      xOffset: position.xOffset,
      yOffset: position.yOffset,
      cluster: start + cluster,
    });
    clusterAdvance.set(cluster, (clusterAdvance.get(cluster) ?? 0) + position.xAdvance);
    cursor += glyph.codePoints.reduce((length, codePoint) => length + (codePoint > 0xffff ? 2 : 1), 0);
  });
  const starts = Array.from(clusterAdvance.keys()).sort((a, b) => a - b);
  const clusters = starts.map((clusterStart, index) => ({
    start: start + clusterStart,
    end: start + (starts[index + 1] ?? text.length),
    advance: clusterAdvance.get(clusterStart) ?? 0,
  }));
  if (!clusters.length && text.length) clusters.push({ start, end: start + text.length, advance: 0 });
  return { font, text, start, end: start + text.length, glyphs, clusters };
}
