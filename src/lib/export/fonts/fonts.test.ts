import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveExportAssets } from '@/test/exportAssets';
import { WarningCollector } from '../warnings';
import { resolveFamily } from './catalog';
import { createFontKey, obfuscateFont, odfFaces, wordFaces } from './embedding';
import { matchFontFace, parseFontFaceCss, parseUnicodeRanges, rangesContain } from './faces';
import { loadFontkit } from './fontkit';
import { ExportFontRegistry } from './registry';
import { shapeText, splitGraphemes } from './shaping';

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => {
  assets = serveExportAssets();
});
afterEach(() => assets.restore());

const style = (family: string, weight = 400, italic = false) => ({ family: resolveFamily(family), weight, italic });

describe('font faces', () => {
  it('parses the generated stylesheets with weights, styles and unicode ranges', () => {
    const faces = parseFontFaceCss(readFileSync('public/fonts/dm-sans.css', 'utf8'));
    expect(faces.map((face) => face.weightMin)).toEqual([400, 500, 600, 700]);
    expect(faces[0].segments.map((segment) => segment.url)).toEqual([
      '/fonts/files/dm-sans-400-normal-latin-ext.woff2',
      '/fonts/files/dm-sans-400-normal-latin.woff2',
    ]);
    expect(parseUnicodeRanges('U+0000-00FF, U+0131, U+4??')).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x400, 0x4ff],
    ]);
    expect(rangesContain(faces[0].segments[1].ranges, 'é'.codePointAt(0) as number)).toBe(true);
  });

  it('ignores font URLs outside the app', () => {
    const faces = parseFontFaceCss(
      "@font-face{font-family:'X';font-weight:400;src:url('https://fonts.example/x.woff2') format('woff2');}",
    );
    expect(faces).toEqual([]);
  });

  it('matches weights like CSS Fonts 4 and reports synthetic bold', () => {
    const inter = parseFontFaceCss(readFileSync('public/fonts/inter.css', 'utf8'));
    expect(matchFontFace(inter, 600)).toMatchObject({ renderWeight: 700, syntheticBold: false });
    expect(matchFontFace(inter, 500)).toMatchObject({ renderWeight: 400, syntheticBold: false });
    const caveat = parseFontFaceCss(readFileSync('public/fonts/caveat.css', 'utf8'));
    const singleWeight = caveat.filter((face) => face.weightMax < 600);
    expect(matchFontFace(singleWeight, 700)).toMatchObject({ syntheticBold: true });
  });
});

describe('ExportFontRegistry', () => {
  it('loads only the families, weights and subsets the text uses', async () => {
    const registry = new ExportFontRegistry(new WarningCollector('pdf'));
    registry.note(style('DM Sans'), 'Plain text');
    registry.note(style('DM Sans', 600), 'Bold');
    registry.note(style('Inter'), 'Zażółć');
    await registry.load({ instances: false, fallback: false });
    const fontRequests = assets.requests.filter((url) => url.endsWith('.woff2'));
    expect(fontRequests.sort()).toEqual([
      '/fonts/files/dm-sans-400-normal-latin.woff2',
      '/fonts/files/inter-400-normal-latin-ext.woff2',
      '/fonts/files/inter-400-normal-latin.woff2',
    ]);
    expect(assets.requests).toContain('/fonts/dm-sans.css');
    expect(assets.requests).not.toContain('/fonts/lora.css');
  });

  it('resolves instances at the weight the editor renders and reuses cached files', async () => {
    const registry = new ExportFontRegistry(new WarningCollector('pdf'));
    registry.note(style('Inter', 600), 'Heading');
    await registry.load({ instances: true, fallback: false });
    const resolution = registry.resolve(style('Inter', 600));
    expect(resolution).toMatchObject({ renderWeight: 700, syntheticBold: false, syntheticItalic: false });
    expect(resolution.fonts[0].font.getVariation).toBeTypeOf('function');

    const before = assets.requests.length;
    const again = new ExportFontRegistry(new WarningCollector('pdf'));
    again.note(style('Inter', 600), 'Heading');
    await again.load({ instances: true, fallback: false });
    expect(assets.requests.slice(before).filter((url) => url.endsWith('.woff2'))).toEqual([]);
  });

  it('draws system families with their standard equivalents and reports unavailable fonts', async () => {
    const warnings = new WarningCollector('pdf');
    const registry = new ExportFontRegistry(warnings);
    registry.note(style('Arial'), 'Sans');
    registry.note(style('Lora'), 'Serif');
    assets.restore();
    await registry.load({ instances: false, fallback: false });
    expect(registry.resolve(style('Arial')).standard).toBe('Helvetica');
    expect(warnings.toArray().map((warning) => warning.code)).toContain('font-unavailable');
  });

  it('loads Noto Sans for characters the selected font lacks', async () => {
    const registry = new ExportFontRegistry(new WarningCollector('pdf'));
    registry.note(style('DM Sans'), 'Ελληνικά');
    await registry.load({ instances: true, fallback: true });
    const fallback = registry.fallbackFor(400, false);
    expect(fallback?.family).toBe('Noto Sans');
    const segments = shapeText('Aλ', registry.resolve(style('DM Sans')), fallback);
    expect(segments.map((segment) => segment.font?.family)).toEqual(['DM Sans', 'Noto Sans']);
  });
});

describe('shaping', () => {
  it('splits grapheme clusters without Intl.Segmenter', () => {
    expect(splitGraphemes('é👍🏽👩‍💻🇩🇪a')).toEqual(['é', '👍🏽', '👩‍💻', '🇩🇪', 'a']);
  });

  it('keeps ligatures off, as the editor does', async () => {
    const registry = new ExportFontRegistry(new WarningCollector('pdf'));
    registry.note(style('Fira Code'), '=> fi');
    await registry.load({ instances: true, fallback: false });
    const [segment] = shapeText('=>', registry.resolve(style('Fira Code')), null);
    expect(segment.glyphs).toHaveLength(2);
    expect(segment.clusters).toHaveLength(2);
  });
});

describe('office font embedding', () => {
  it('builds Word regular/bold faces and ODF faces per weight', async () => {
    const registry = new ExportFontRegistry(new WarningCollector('docx'));
    registry.note(style('DM Sans'), 'Body text');
    registry.note(style('DM Sans', 600), 'Strong words in body text');
    registry.note(style('DM Sans', 700), 'Heading');
    await registry.load({ instances: true, fallback: false });
    const fontkit = await loadFontkit();

    const word = wordFaces(registry).get('DM Sans');
    expect(word?.regular?.weight).toBe(400);
    // The bold slot is the weight most bold text uses.
    expect(word?.bold?.weight).toBe(600);
    const bold = fontkit.create(word?.bold?.bytes as Uint8Array);
    expect(bold['OS/2']?.usWeightClass).toBe(600);
    expect(bold.familyName).toBe('DM Sans');

    const odf = odfFaces(registry);
    expect(odf.map((face) => [face.familyName, face.weight])).toEqual([
      ['DM Sans', 400],
      ['DM Sans SemiBold', 600],
      ['DM Sans', 700],
    ]);
  });

  it('obfuscates fonts reversibly with the GUID key', () => {
    const bytes = new Uint8Array(64).map((_, index) => index);
    const key = createFontKey();
    expect(key).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/);
    const obfuscated = obfuscateFont(bytes, key);
    expect(obfuscated.slice(32)).toEqual(bytes.slice(32));
    expect(obfuscated.slice(0, 32)).not.toEqual(bytes.slice(0, 32));
    expect(obfuscateFont(obfuscated, key)).toEqual(bytes);
    // ECMA-376 §17.8.1: byte 0 is XORed with the last hex pair of the GUID.
    const fixed = obfuscateFont(new Uint8Array(32), '{00000000-0000-0000-0000-0000000000AB}');
    expect(fixed[0]).toBe(0xab);
    expect(fixed[16]).toBe(0xab);
  });
});
