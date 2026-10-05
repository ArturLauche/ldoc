import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadFontkit } from './fontkit';
import { buildCmap, buildStaticFont, woff2ToTrueType } from './sfnt';

const fontFile = (name: string) => new Uint8Array(readFileSync(`public/fonts/files/${name}`));

describe('sfnt writer', () => {
  it('converts a variable WOFF2 font to TrueType that can be instanced', async () => {
    const fontkit = await loadFontkit();
    const woff2 = fontkit.create(fontFile('inter-400-normal-latin.woff2'));
    const ttf = woff2ToTrueType(woff2);
    expect(String.fromCharCode(...ttf.slice(0, 4))).toBe('\u0000\u0001\u0000\u0000');

    const parsed = fontkit.create(ttf);
    expect(parsed.numGlyphs).toBe(woff2.numGlyphs);
    const regular = parsed.getVariation({ wght: 400 });
    const bold = parsed.getVariation({ wght: 700 });
    const h = 'H'.codePointAt(0) as number;
    expect(bold.glyphForCodePoint(h).advanceWidth).toBeGreaterThan(regular.glyphForCodePoint(h).advanceWidth);
    // Composite glyphs (é = e + acute) resolve under a variation.
    const eAcute = bold.glyphForCodePoint(0xe9);
    expect(eAcute.path.commands.length).toBeGreaterThan(10);
    expect(regular.glyphForCodePoint(h).path.bbox).toEqual(woff2.glyphForCodePoint(h).path.bbox);
  });

  it('writes a static instance with cmap, metrics and names', async () => {
    const fontkit = await loadFontkit();
    const variable = fontkit.create(woff2ToTrueType(fontkit.create(fontFile('dm-sans-400-normal-latin.woff2'))));
    const instance = variable.getVariation({ wght: 600 });
    const text = 'Héllo';
    const codePoints = new Map<number, number>();
    for (const char of text) {
      const codePoint = char.codePointAt(0) as number;
      codePoints.set(codePoint, instance.glyphForCodePoint(codePoint).id);
    }
    const built = buildStaticFont({
      sources: [{ font: instance, glyphIds: codePoints.values(), codePoints }],
      names: { family: 'DM Sans', subfamily: 'Bold', fullName: 'DM Sans Bold', postScriptName: 'DMSans-Bold' },
      weightClass: 600,
      bold: true,
    });
    const reparsed = fontkit.create(built.bytes);
    expect(reparsed.numGlyphs).toBe(5);
    expect(reparsed.familyName).toBe('DM Sans');
    expect(reparsed['OS/2']?.usWeightClass).toBe(600);
    const original = instance.glyphForCodePoint(0x48);
    const copy = reparsed.glyphForCodePoint(0x48);
    expect(copy.id).toBe(built.glyphMaps[0].get(original.id));
    expect(copy.advanceWidth).toBe(Math.round(original.advanceWidth));
    expect(Math.abs(copy.path.bbox.maxX - original.path.bbox.maxX)).toBeLessThanOrEqual(1);
    expect(reparsed.glyphForCodePoint(0xe9).path.commands.length).toBeGreaterThan(10);
    expect(reparsed.hasGlyphForCodePoint('z'.codePointAt(0) as number)).toBe(false);
  });

  it('encodes sparse and supplementary cmap entries', async () => {
    const fontkit = await loadFontkit();
    const cmap = buildCmap(new Map([[0x41, 3], [0x42, 7], [0x43, 8], [0x1f600, 9]]));
    expect(cmap.length).toBeGreaterThan(40);
    const view = new DataView(cmap.buffer);
    expect(view.getUint16(2)).toBe(4);
    expect(fontkit).toBeTruthy();
  });
});
