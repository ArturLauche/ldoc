import { describe, expect, it } from 'vitest';
import type { FaceResolution, LoadedFont } from './registry';
import { resolveFamily } from './catalog';
import { shapeText } from './shaping';

/** A font whose shaper reverses glyphs for RTL, like fontkit's OpenType engine. */
function fakeFont(): LoadedFont {
  const family = resolveFamily('Inter');
  const layout = (
    text: string,
    _features?: unknown,
    _script?: string,
    _language?: string,
    direction?: 'ltr' | 'rtl',
  ) => {
    const glyphs = Array.from(text).map((character, index) => ({
      id: index + 1,
      codePoints: [character.codePointAt(0) as number],
      path: { commands: [], bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } },
      advanceWidth: 500,
      cbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    }));
    const positions = glyphs.map(() => ({ xAdvance: 500, yAdvance: 0, xOffset: 0, yOffset: 0 }));
    if (direction === 'rtl') {
      glyphs.reverse();
      positions.reverse();
    }
    return { glyphs, positions };
  };
  return {
    key: 'fake',
    family: family.name,
    renderWeight: 400,
    ranges: [[0, 0x10ffff]],
    sourceBytes: new Uint8Array(),
    sourceUrl: '/fonts/fake.ttf',
    fallback: false,
    italic: false,
    font: {
      unitsPerEm: 1000,
      layout,
      hasGlyphForCodePoint: () => true,
    },
  } as unknown as LoadedFont;
}

function resolution(font: LoadedFont): FaceResolution {
  return {
    requested: resolveFamily('Inter'),
    family: resolveFamily('Inter'),
    cssWeight: 400,
    renderWeight: 400,
    syntheticBold: false,
    syntheticItalic: false,
    fonts: [font],
  };
}

describe('shapeText direction', () => {
  it('keeps RTL clusters in logical order while the shaper works visually', () => {
    const font = fakeFont();
    const [segment] = shapeText('אב', resolution(font), null, 'rtl');
    expect(segment.clusters).toEqual([
      { start: 0, end: 1, advance: 500 },
      { start: 1, end: 2, advance: 500 },
    ]);
    expect(segment.glyphs.map((glyph) => glyph.cluster)).toEqual([0, 1]);
    expect(segment.glyphs.map((glyph) => glyph.id)).toEqual([1, 2]);
  });

  it('keeps LTR clusters and glyphs in text order', () => {
    const font = fakeFont();
    const [segment] = shapeText('ab', resolution(font), null, 'ltr');
    expect(segment.glyphs.map((glyph) => glyph.cluster)).toEqual([0, 1]);
    expect(segment.glyphs.map((glyph) => glyph.id)).toEqual([1, 2]);
  });

  it('offsets clusters by the run start', () => {
    const font = fakeFont();
    const [segment] = shapeText('אב', resolution(font), null, 'rtl', 10);
    expect(segment.clusters.map((cluster) => cluster.start)).toEqual([10, 11]);
    expect(segment.glyphs.map((glyph) => glyph.cluster)).toEqual([10, 11]);
  });
});
