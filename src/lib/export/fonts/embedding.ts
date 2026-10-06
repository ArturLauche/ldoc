import { BoundedCache } from '../resources';
import type { ResolvedFamily } from './catalog';
import { rangesContain } from './faces';
import type { ExportFontRegistry, LoadedFont } from './registry';
import { buildStaticFont } from './sfnt';

/**
 * Static font files for embedding in office documents. Each face is an
 * instance of the exact self-hosted font the editor renders with, at the
 * weight the editor resolves, covering every character of the unicode-range
 * subsets the document uses (so the text stays editable in that font).
 */
export interface EmbeddedFace {
  family: string;
  /** Weight of the instance (usWeightClass). */
  weight: number;
  /** Name office applications register the face under. */
  familyName: string;
  styleName: string;
  bytes: Uint8Array;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

export function weightName(weight: number): string {
  return WEIGHT_NAMES[Math.round(weight / 100) * 100] ?? 'Regular';
}

function mostUsed(counts: Map<number, number>, predicate: (weight: number) => boolean): number | null {
  let best: number | null = null;
  let bestCount = -1;
  counts.forEach((count, weight) => {
    if (!predicate(weight)) return;
    if (count > bestCount) {
      best = weight;
      bestCount = count;
    }
  });
  return best;
}

// A face covers whole unicode-range files, not the document's characters, so
// it only depends on its inputs: repeated exports reuse it.
const faceCache = new BoundedCache<EmbeddedFace>(24 * 1024 * 1024, (face) => face.bytes.byteLength);

function buildFace(fonts: LoadedFont[], family: string, weight: number, familyName: string, styleName: string, bold: boolean): EmbeddedFace | null {
  if (!fonts.length) return null;
  const key = [family, weight, familyName, styleName, bold, ...fonts.map((font) => font.key)].join('|');
  const cached = faceCache.get(key);
  if (cached) return cached;
  const face = buildFaceUncached(fonts, family, weight, familyName, styleName, bold);
  faceCache.set(key, face);
  return face;
}

function buildFaceUncached(fonts: LoadedFont[], family: string, weight: number, familyName: string, styleName: string, bold: boolean): EmbeddedFace {
  const sources = fonts.map((loaded) => {
    const codePoints = new Map<number, number>();
    loaded.font.characterSet.forEach((codePoint) => {
      if (!rangesContain(loaded.ranges, codePoint)) return;
      const glyph = loaded.font.glyphForCodePoint(codePoint);
      if (glyph.id > 0) codePoints.set(codePoint, glyph.id);
    });
    return { font: loaded.font, glyphIds: codePoints.values(), codePoints };
  });
  const postScript = `${familyName.replace(/\s+/g, '')}-${styleName.replace(/\s+/g, '')}`;
  const typographic = familyName !== family;
  const built = buildStaticFont({
    sources,
    names: {
      family: familyName,
      subfamily: styleName,
      fullName: `${familyName} ${styleName}`.replace(/ Regular$/, ''),
      postScriptName: postScript,
      ...(typographic ? { typographicFamily: family, typographicSubfamily: weightName(weight) } : {}),
    },
    weightClass: weight,
    bold,
    overlap: true,
  });
  return { family, weight, familyName, styleName, bytes: built.bytes };
}

/** Loaded files (all unicode-range subsets) for a family at the face a CSS weight resolves to. */
function fontsAt(registry: ExportFontRegistry, family: ResolvedFamily, cssWeight: number): LoadedFont[] {
  return registry.resolve({ family, weight: cssWeight, italic: false }).fonts;
}

/**
 * WordprocessingML only knows regular and bold per family: the regular slot
 * gets the weight most text below 600 uses, the bold slot the weight most
 * bold text uses (e.g. DM Sans `strong` is 600, h1 700).
 */
export function wordFaces(registry: ExportFontRegistry): Map<string, { regular?: EmbeddedFace; bold?: EmbeddedFace }> {
  const result = new Map<string, { regular?: EmbeddedFace; bold?: EmbeddedFace }>();
  registry.families.forEach((usage) => {
    if (usage.family.kind !== 'bundled' || registry.isUnavailable(usage.family.name)) return;
    const family = usage.family.name;
    const entry: { regular?: EmbeddedFace; bold?: EmbeddedFace } = {};
    const regularWeight = mostUsed(usage.counts, (weight) => weight < 600) ?? 400;
    const boldWeight = mostUsed(usage.counts, (weight) => weight >= 600);
    const regularFonts = fontsAt(registry, usage.family, regularWeight);
    const regular = regularFonts[0] ? buildFace(regularFonts, family, regularFonts[0].renderWeight, family, 'Regular', false) : null;
    if (regular) entry.regular = regular;
    if (boldWeight !== null) {
      const boldFonts = fontsAt(registry, usage.family, boldWeight);
      const bold = boldFonts[0] ? buildFace(boldFonts, family, boldFonts[0].renderWeight, family, 'Bold', true) : null;
      if (bold) entry.bold = bold;
    }
    if (entry.regular || entry.bold) result.set(family, entry);
  });
  return result;
}

/**
 * ODF carries numeric weights, so every weight the document uses gets its own
 * face: 400/700 as the family's Regular/Bold, others as "Family SemiBold" etc.
 * with typographic names, which LibreOffice matches by weight (except 500,
 * which the ODT writer references by the face's own family name).
 */
export function odfFaces(registry: ExportFontRegistry): EmbeddedFace[] {
  const faces: EmbeddedFace[] = [];
  registry.families.forEach((usage) => {
    if (usage.family.kind !== 'bundled' || registry.isUnavailable(usage.family.name)) return;
    const family = usage.family.name;
    const seen = new Set<number>();
    usage.weights.forEach((_, cssWeight) => {
      const fonts = fontsAt(registry, usage.family, cssWeight);
      const weight = fonts[0]?.renderWeight;
      if (!weight || seen.has(weight)) return;
      seen.add(weight);
      const standard = weight === 400 || weight === 700;
      const face = buildFace(
        fonts,
        family,
        weight,
        standard ? family : `${family} ${weightName(weight)}`,
        standard ? (weight === 700 ? 'Bold' : 'Regular') : 'Regular',
        weight >= 600,
      );
      if (face) faces.push(face);
    });
  });
  return faces;
}

/**
 * ECMA-376 Part 1 §17.8.1 font obfuscation: the first 32 bytes are XORed
 * with the GUID key (its hex digits read as bytes in reverse order).
 */
export function obfuscateFont(bytes: Uint8Array, guid: string): Uint8Array {
  const hex = guid.replace(/[{}-]/g, '');
  const key = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    key[index] = Number.parseInt(hex.slice(30 - index * 2, 32 - index * 2), 16);
  }
  const output = bytes.slice();
  for (let index = 0; index < 32 && index < output.length; index += 1) {
    output[index] ^= key[index % 16];
  }
  return output;
}

export function createFontKey(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16));
  return `{${uuid.toUpperCase()}}`;
}
