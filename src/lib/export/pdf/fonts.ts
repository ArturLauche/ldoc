import {
  PDFHexString,
  PDFString,
  StandardFonts,
  type PDFDocument,
  type PDFFont,
  type PDFRef,
} from 'pdf-lib';
import type { StandardFamily } from '../fonts/catalog';
import type { LoadedFont } from '../fonts/registry';
import { buildStaticFont } from '../fonts/sfnt';
import { hashString } from '../shared';

/** Vertical metrics in font units, as the browser lays the font out. */
export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  underlinePosition: number;
  underlineThickness: number;
  strikeoutPosition: number;
  strikeoutSize: number;
}

export interface PdfTextFont {
  key: string;
  ref: PDFRef;
  /** The browser would synthesize bold/italic for this face (bundled single-style fonts). */
  synthesizes: boolean;
  metrics: FontMetrics;
  /** Hex string for glyph ids (embedded) or text (standard). */
  encode(glyphs: Array<{ id: number; text: string }>): PDFHexString;
  /** Default advance the PDF viewer uses per glyph (font units), to compute TJ corrections. */
  defaultAdvance(glyph: { id: number; text: string }): number;
}

const SUBSET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function subsetTag(seed: string): string {
  let value = Number.parseInt(hashString(seed), 16) || 1;
  let tag = '';
  for (let index = 0; index < 6; index += 1) {
    tag += SUBSET_LETTERS[value % 26];
    value = Math.floor(value / 26) + index * 7 + 3;
  }
  return tag;
}

function utf16Hex(text: string): string {
  let hex = '';
  for (let index = 0; index < text.length; index += 1) {
    hex += text.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return hex;
}

/**
 * A font file embedded as a Type 0 / CIDFontType2 font. Content streams use
 * the source font's glyph ids as CIDs, so drawing can start before the
 * subset exists; `finalize` writes a static subset with a CIDToGIDMap.
 */
class EmbeddedTrueTypeFont implements PdfTextFont {
  readonly ref: PDFRef;
  readonly metrics: FontMetrics;
  readonly synthesizes: boolean;
  private readonly used = new Map<number, string>();

  constructor(
    readonly key: string,
    private readonly source: LoadedFont,
    private readonly document: PDFDocument,
  ) {
    this.ref = document.context.nextRef();
    this.synthesizes = !source.fallback;
    const font = source.font;
    const os2 = font['OS/2'];
    this.metrics = {
      unitsPerEm: font.unitsPerEm,
      ascent: font.ascent,
      descent: font.descent,
      underlinePosition: font.underlinePosition || -font.unitsPerEm * 0.1,
      underlineThickness: font.underlineThickness || font.unitsPerEm * 0.05,
      strikeoutPosition: os2?.yStrikeoutPosition || font.unitsPerEm * 0.3,
      strikeoutSize: os2?.yStrikeoutSize || font.unitsPerEm * 0.05,
    };
  }

  encode(glyphs: Array<{ id: number; text: string }>): PDFHexString {
    let hex = '';
    glyphs.forEach((glyph) => {
      if (!this.used.has(glyph.id) || (!this.used.get(glyph.id) && glyph.text)) this.used.set(glyph.id, glyph.text);
      hex += glyph.id.toString(16).padStart(4, '0');
    });
    return PDFHexString.of(hex);
  }

  defaultAdvance(glyph: { id: number }): number {
    return this.source.font.getGlyph(glyph.id).advanceWidth;
  }

  finalize(): void {
    const { font } = this.source;
    const glyphIds = Array.from(this.used.keys());
    const familyName = this.source.family.replace(/\s+/g, '');
    const postScript = `${familyName}-${this.source.renderWeight}${this.source.italic ? 'Italic' : ''}`;
    const built = buildStaticFont({
      sources: [{ font, glyphIds, codePoints: new Map() }],
      names: {
        family: this.source.family,
        subfamily: 'Regular',
        fullName: `${this.source.family} ${this.source.renderWeight}`,
        postScriptName: postScript,
      },
      weightClass: this.source.renderWeight,
      bold: this.source.renderWeight >= 600,
      overlap: true,
    });
    const context = this.document.context;
    const scale = 1000 / font.unitsPerEm;
    const baseFont = `${subsetTag(`${postScript}|${glyphIds.join(',')}`)}+${postScript}`;

    const maxCid = Math.max(0, ...glyphIds);
    const cidToGid = new Uint8Array((maxCid + 1) * 2);
    built.glyphMaps[0].forEach((newId, oldId) => {
      cidToGid[oldId * 2] = newId >> 8;
      cidToGid[oldId * 2 + 1] = newId & 0xff;
    });

    const widths: Array<number | number[]> = [];
    glyphIds
      .sort((a, b) => a - b)
      .forEach((gid) => {
        widths.push(gid, [Math.round(font.getGlyph(gid).advanceWidth * scale)]);
      });

    const fontFile = context.flateStream(built.bytes, { Length1: built.bytes.length });
    const descriptor = context.obj({
      Type: 'FontDescriptor',
      FontName: baseFont,
      Flags: (font.post?.isFixedPitch ? 1 : 0) | 32,
      FontBBox: [font.bbox.minX, font.bbox.minY, font.bbox.maxX, font.bbox.maxY].map((value) => Math.round(value * scale)),
      ItalicAngle: 0,
      Ascent: Math.round(font.ascent * scale),
      Descent: Math.round(font.descent * scale),
      CapHeight: Math.round((font['OS/2']?.capHeight || font.ascent * 0.7) * scale),
      StemV: Math.round(80 + (this.source.renderWeight - 400) / 5),
      FontFile2: context.register(fontFile),
    });
    const cidFont = context.obj({
      Type: 'Font',
      Subtype: 'CIDFontType2',
      BaseFont: baseFont,
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: context.register(descriptor),
      W: widths,
      CIDToGIDMap: context.register(context.flateStream(cidToGid)),
      DW: 1000,
    });
    const type0 = context.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: baseFont,
      Encoding: 'Identity-H',
      DescendantFonts: [context.register(cidFont)],
      ToUnicode: context.register(context.flateStream(this.toUnicode())),
    });
    context.assign(this.ref, type0);
  }

  private toUnicode(): string {
    const entries = Array.from(this.used.entries())
      .filter(([, text]) => text.length > 0)
      .sort((a, b) => a[0] - b[0]);
    const blocks: string[] = [];
    for (let index = 0; index < entries.length; index += 100) {
      const chunk = entries.slice(index, index + 100);
      blocks.push(
        `${chunk.length} beginbfchar\n${chunk
          .map(([gid, text]) => `<${gid.toString(16).padStart(4, '0')}> <${utf16Hex(text)}>`)
          .join('\n')}\nendbfchar`,
      );
    }
    return [
      '/CIDInit /ProcSet findresource begin',
      '12 dict begin',
      'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Adobe-Identity-UCS def',
      '/CMapType 2 def',
      '1 begincodespacerange',
      '<0000> <FFFF>',
      'endcodespacerange',
      ...blocks,
      'endcmap',
      'CMapName currentdict /CMap defineresource pop',
      'end',
      'end',
    ].join('\n');
  }
}

// Line metrics of the system fonts the editor showed (Arial, Times New Roman,
// Courier New), so line boxes match; glyphs come from the PDF base-14 fonts.
const STANDARD_METRICS: Record<StandardFamily, FontMetrics> = {
  Helvetica: { unitsPerEm: 1000, ascent: 905, descent: -212, underlinePosition: -106, underlineThickness: 73, strikeoutPosition: 259, strikeoutSize: 51 },
  Times: { unitsPerEm: 1000, ascent: 891, descent: -216, underlinePosition: -109, underlineThickness: 49, strikeoutPosition: 259, strikeoutSize: 49 },
  Courier: { unitsPerEm: 1000, ascent: 833, descent: -300, underlinePosition: -100, underlineThickness: 50, strikeoutPosition: 259, strikeoutSize: 50 },
};

const STANDARD_FONTS: Record<StandardFamily, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

class StandardTextFont implements PdfTextFont {
  readonly ref: PDFRef;
  readonly synthesizes = false;

  constructor(
    readonly key: string,
    private readonly font: PDFFont,
    readonly metrics: FontMetrics,
  ) {
    this.ref = font.ref;
  }

  encode(glyphs: Array<{ id: number; text: string }>): PDFHexString {
    return this.font.encodeText(glyphs.map((glyph) => glyph.text).join(''));
  }

  defaultAdvance(glyph: { text: string }): number {
    return this.font.widthOfTextAtSize(glyph.text, 1000);
  }

  width(text: string, sizePx: number): number {
    return this.font.widthOfTextAtSize(text, sizePx);
  }
}

export type { StandardTextFont };

/** Creates and caches PDF fonts for one document. */
export class PdfFontSet {
  private readonly embedded = new Map<string, EmbeddedTrueTypeFont>();
  private readonly standard = new Map<string, StandardTextFont>();

  constructor(private readonly document: PDFDocument) {}

  forLoaded(font: LoadedFont): PdfTextFont {
    let entry = this.embedded.get(font.key);
    if (!entry) {
      entry = new EmbeddedTrueTypeFont(font.key, font, this.document);
      this.embedded.set(font.key, entry);
    }
    return entry;
  }

  forStandard(family: StandardFamily, bold: boolean, italic: boolean): StandardTextFont {
    const key = `${family}|${bold}|${italic}`;
    let entry = this.standard.get(key);
    if (!entry) {
      const variant = STANDARD_FONTS[family][(bold ? 1 : 0) + (italic ? 2 : 0)];
      entry = new StandardTextFont(key, this.document.embedStandardFont(variant), STANDARD_METRICS[family]);
      this.standard.set(key, entry);
    }
    return entry;
  }

  /** Writes subset font programs; call once after all drawing. */
  finalize(): void {
    this.embedded.forEach((font) => font.finalize());
  }
}
