/**
 * The small slice of fontkit (bundled with pdf-lib) that the export font
 * pipeline uses. fontkit ships loose typings, so the shapes we rely on are
 * declared here and the module is narrowed once at the lazy import.
 */

export interface FontkitBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FontkitPathCommand {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath';
  args: number[];
}

export interface FontkitPath {
  commands: FontkitPathCommand[];
  bbox: FontkitBBox;
}

export interface FontkitGlyph {
  id: number;
  codePoints: number[];
  path: FontkitPath;
  advanceWidth: number;
  cbox: FontkitBBox;
  /** Internal: the decoded `glyf` record (points or components). */
  _decode?: () => FontkitDecodedGlyph | null;
}

export interface FontkitPoint {
  x: number;
  y: number;
  onCurve: boolean;
  endContour: boolean;
}

export interface FontkitComponent {
  glyphID: number;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  scale01: number;
  scale10: number;
}

export interface FontkitDecodedGlyph {
  numberOfContours: number;
  points?: FontkitPoint[];
  components?: FontkitComponent[];
}

export interface FontkitGlyphPosition {
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

export interface FontkitGlyphRun {
  glyphs: FontkitGlyph[];
  positions: FontkitGlyphPosition[];
}

interface FontkitStream {
  buffer: Uint8Array;
  pos: number;
}

export interface FontkitTableEntry {
  offset: number;
  length: number;
  transformed?: boolean;
}

export interface FontkitFont {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  underlinePosition: number;
  underlineThickness: number;
  numGlyphs: number;
  bbox: FontkitBBox;
  familyName: string;
  postscriptName: string | null;
  variationAxes: Record<string, { min: number; default: number; max: number }>;
  directory: { tag?: string; tables: Record<string, FontkitTableEntry | undefined> };
  'OS/2'?: {
    yStrikeoutPosition: number;
    yStrikeoutSize: number;
    usWeightClass: number;
    sTypoAscender: number;
    capHeight?: number;
    xHeight?: number;
  };
  post?: { isFixedPitch: number; italicAngle: number };
  hhea: { ascent: number; descent: number; lineGap: number };
  head: { unitsPerEm: number; macStyle: unknown };
  characterSet: number[];
  glyphForCodePoint(codePoint: number): FontkitGlyph;
  hasGlyphForCodePoint(codePoint: number): boolean;
  getGlyph(id: number, codePoints?: number[]): FontkitGlyph;
  layout(text: string, features?: string[] | Record<string, boolean>): FontkitGlyphRun;
  getVariation(settings: Record<string, number>): FontkitFont;
  /** Internal: positions the shared stream at a table's raw bytes. */
  _getTableStream(tag: string): FontkitStream | null;
}

export interface FontkitModule {
  create(buffer: Uint8Array, postscriptName?: string): FontkitFont;
}

let fontkitPromise: Promise<FontkitModule> | null = null;

/** fontkit is large (brotli, shaping tables); load it once, only during an export. */
export function loadFontkit(): Promise<FontkitModule> {
  fontkitPromise ??= import('@pdf-lib/fontkit').then(
    (module) => (module.default ?? module) as unknown as FontkitModule,
  );
  return fontkitPromise;
}

/** Copies a table's raw bytes (decompressed for WOFF2). */
export function readRawTable(font: FontkitFont, tag: string): Uint8Array | null {
  const entry = font.directory.tables[tag];
  if (!entry) return null;
  // Touching a decoded table forces WOFF2 decompression, which rewrites the
  // directory offsets to point into the decompressed stream.
  void font.head;
  const stream = font._getTableStream(tag);
  if (!stream) return null;
  const source = stream.buffer;
  return new Uint8Array(source.buffer, source.byteOffset + stream.pos, entry.length).slice();
}
