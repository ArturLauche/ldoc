import { readRawTable, type FontkitFont, type FontkitPathCommand } from './fontkit';

/**
 * Minimal TrueType (sfnt) writer. It serves two jobs:
 *
 * 1. `woff2ToTrueType` turns a WOFF2 file back into a plain TrueType font.
 *    fontkit can read WOFF2, but it cannot apply variations to WOFF2 fonts
 *    with composite glyphs, and Office applications cannot embed WOFF2.
 * 2. `buildStaticFont` writes a standalone static font (one weight, flattened
 *    outlines, its own cmap/name/OS/2) from a possibly variable source, for
 *    PDF, DOCX and ODT embedding.
 *
 * Table layouts follow the OpenType specification (https://learn.microsoft.com/typography/opentype/spec/).
 */

class ByteWriter {
  private buffer = new Uint8Array(1024);
  private view = new DataView(this.buffer.buffer);
  length = 0;

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  u8(value: number): void {
    this.ensure(1);
    this.view.setUint8(this.length, value);
    this.length += 1;
  }

  i8(value: number): void {
    this.ensure(1);
    this.view.setInt8(this.length, value);
    this.length += 1;
  }

  u16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.length, value & 0xffff);
    this.length += 2;
  }

  i16(value: number): void {
    this.ensure(2);
    this.view.setInt16(this.length, clampInt16(value));
    this.length += 2;
  }

  u32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.length, value >>> 0);
    this.length += 4;
  }

  bytes(value: Uint8Array): void {
    this.ensure(value.length);
    this.buffer.set(value, this.length);
    this.length += value.length;
  }

  pad(alignment: number): void {
    while (this.length % alignment) this.u8(0);
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

function f2dot14(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value * 16384)));
}

function tableChecksum(bytes: Uint8Array): number {
  let sum = 0;
  const padded = Math.ceil(bytes.length / 4) * 4;
  for (let index = 0; index < padded; index += 4) {
    const word =
      ((bytes[index] ?? 0) << 24) |
      ((bytes[index + 1] ?? 0) << 16) |
      ((bytes[index + 2] ?? 0) << 8) |
      (bytes[index + 3] ?? 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

/** Writes the table directory, padding and the `head` checksum adjustment. */
export function assembleSfnt(tables: Map<string, Uint8Array>): Uint8Array {
  const tags = Array.from(tables.keys()).sort();
  const numTables = tags.length;
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const headerSize = 12 + numTables * 16;
  const writer = new ByteWriter();
  writer.u32(0x00010000);
  writer.u16(numTables);
  writer.u16(searchRange);
  writer.u16(entrySelector);
  writer.u16(numTables * 16 - searchRange);

  let offset = headerSize;
  const placements = tags.map((tag) => {
    const data = tables.get(tag) as Uint8Array;
    const placement = { tag, data, offset };
    offset += Math.ceil(data.length / 4) * 4;
    return placement;
  });
  placements.forEach(({ tag, data, offset: tableOffset }) => {
    for (let index = 0; index < 4; index += 1) writer.u8(tag.charCodeAt(index) || 0x20);
    writer.u32(tableChecksum(data));
    writer.u32(tableOffset);
    writer.u32(data.length);
  });
  placements.forEach(({ data }) => {
    writer.bytes(data);
    writer.pad(4);
  });
  const bytes = writer.toBytes();
  const headPlacement = placements.find((placement) => placement.tag === 'head');
  if (headPlacement && headPlacement.data.length >= 12) {
    const adjustment = (0xb1b0afba - tableChecksum(bytes)) >>> 0;
    new DataView(bytes.buffer).setUint32(headPlacement.offset + 8, adjustment);
  }
  return bytes;
}

interface ContourPoint {
  x: number;
  y: number;
  on: boolean;
}

/** Converts a fontkit outline back into TrueType contours (quadratic splines). */
export function pathToContours(commands: FontkitPathCommand[]): ContourPoint[][] {
  const contours: ContourPoint[][] = [];
  let current: ContourPoint[] = [];
  let pen = { x: 0, y: 0 };
  const finish = () => {
    if (current.length > 1) {
      const first = current[0];
      const last = current[current.length - 1];
      if (last.on && first.on && last.x === first.x && last.y === first.y) current.pop();
    }
    if (current.length) contours.push(current);
    current = [];
  };
  const point = (x: number, y: number, on: boolean) => {
    current.push({ x: Math.round(x), y: Math.round(y), on });
  };
  for (const { command, args } of commands) {
    if (command === 'moveTo') {
      finish();
      point(args[0], args[1], true);
      pen = { x: args[0], y: args[1] };
    } else if (command === 'lineTo') {
      point(args[0], args[1], true);
      pen = { x: args[0], y: args[1] };
    } else if (command === 'quadraticCurveTo') {
      point(args[0], args[1], false);
      point(args[2], args[3], true);
      pen = { x: args[2], y: args[3] };
    } else if (command === 'bezierCurveTo') {
      cubicToQuadratics(pen, args).forEach(([cx, cy, x, y]) => {
        point(cx, cy, false);
        point(x, y, true);
      });
      pen = { x: args[4], y: args[5] };
    } else {
      finish();
    }
  }
  finish();
  return contours.filter((contour) => contour.length > 0);
}

/** Approximates a cubic Bézier with quadratics by uniform subdivision (fonts here are TrueType; this is a safety net). */
function cubicToQuadratics(start: { x: number; y: number }, args: number[]): number[][] {
  const [c1x, c1y, c2x, c2y, ex, ey] = args;
  const segments = 4;
  const result: number[][] = [];
  const at = (t: number) => {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * start.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * ex,
      y: mt * mt * mt * start.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ey,
    };
  };
  const derivative = (t: number) => {
    const mt = 1 - t;
    return {
      x: 3 * mt * mt * (c1x - start.x) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (ex - c2x),
      y: 3 * mt * mt * (c1y - start.y) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (ey - c2y),
    };
  };
  for (let index = 0; index < segments; index += 1) {
    const t0 = index / segments;
    const t1 = (index + 1) / segments;
    const p0 = at(t0);
    const p1 = at(t1);
    const d0 = derivative(t0);
    const d1 = derivative(t1);
    // Control point where the end tangents meet; midpoint fallback when parallel.
    const cross = d0.x * d1.y - d0.y * d1.x;
    let control = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    if (Math.abs(cross) > 1e-9) {
      const s = ((p1.x - p0.x) * d1.y - (p1.y - p0.y) * d1.x) / cross;
      control = { x: p0.x + d0.x * s, y: p0.y + d0.y * s };
    }
    result.push([control.x, control.y, p1.x, p1.y]);
  }
  return result;
}

interface GlyphBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

function boundsOf(points: Array<{ x: number; y: number }>): GlyphBounds {
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  points.forEach(({ x, y }) => {
    xMin = Math.min(xMin, x);
    yMin = Math.min(yMin, y);
    xMax = Math.max(xMax, x);
    yMax = Math.max(yMax, y);
  });
  return { xMin, yMin, xMax, yMax };
}

const ON_CURVE = 0x01;
const X_SHORT = 0x02;
const Y_SHORT = 0x04;
const REPEAT = 0x08;
const X_SAME_OR_POSITIVE = 0x10;
const Y_SAME_OR_POSITIVE = 0x20;
const OVERLAP_SIMPLE = 0x40;

/** Encodes one simple glyph (`numberOfContours >= 1`) without hinting instructions. */
export function encodeSimpleGlyph(contours: ContourPoint[][], overlap = false): { bytes: Uint8Array; bounds: GlyphBounds; points: number } {
  const points = contours.flat();
  const bounds = boundsOf(points);
  const writer = new ByteWriter();
  writer.i16(contours.length);
  writer.i16(bounds.xMin);
  writer.i16(bounds.yMin);
  writer.i16(bounds.xMax);
  writer.i16(bounds.yMax);
  let end = -1;
  contours.forEach((contour) => {
    end += contour.length;
    writer.u16(end);
  });
  writer.u16(0);

  const flags: number[] = [];
  const xs = new ByteWriter();
  const ys = new ByteWriter();
  let previousX = 0;
  let previousY = 0;
  points.forEach((point, index) => {
    let flag = point.on ? ON_CURVE : 0;
    if (index === 0 && overlap) flag |= OVERLAP_SIMPLE;
    const dx = point.x - previousX;
    const dy = point.y - previousY;
    if (dx === 0) flag |= X_SAME_OR_POSITIVE;
    else if (Math.abs(dx) <= 255) {
      flag |= X_SHORT | (dx > 0 ? X_SAME_OR_POSITIVE : 0);
      xs.u8(Math.abs(dx));
    } else xs.i16(dx);
    if (dy === 0) flag |= Y_SAME_OR_POSITIVE;
    else if (Math.abs(dy) <= 255) {
      flag |= Y_SHORT | (dy > 0 ? Y_SAME_OR_POSITIVE : 0);
      ys.u8(Math.abs(dy));
    } else ys.i16(dy);
    flags.push(flag);
    previousX = point.x;
    previousY = point.y;
  });
  for (let index = 0; index < flags.length; ) {
    const flag = flags[index];
    let run = 1;
    while (index + run < flags.length && flags[index + run] === flag && run < 256) run += 1;
    if (run > 1) {
      writer.u8(flag | REPEAT);
      writer.u8(run - 1);
    } else {
      writer.u8(flag);
    }
    index += run;
  }
  writer.bytes(xs.toBytes());
  writer.bytes(ys.toBytes());
  return { bytes: writer.toBytes(), bounds, points: points.length };
}

const ARG_1_AND_2_ARE_WORDS = 0x0001;
const ARGS_ARE_XY_VALUES = 0x0002;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;

/**
 * Converts a WOFF2 font into an equivalent TrueType font. WOFF2 stores `glyf`
 * and `loca` in a transformed layout; everything else is copied verbatim.
 * Composite glyphs stay composite so `gvar` deltas still line up.
 */
export function woff2ToTrueType(font: FontkitFont): Uint8Array {
  const tables = new Map<string, Uint8Array>();
  for (const tag of Object.keys(font.directory.tables)) {
    if (tag === 'glyf' || tag === 'loca' || tag === 'DSIG') continue;
    const raw = readRawTable(font, tag);
    if (raw) tables.set(tag, raw);
  }
  const glyf = new ByteWriter();
  const offsets: number[] = [];
  for (let gid = 0; gid < font.numGlyphs; gid += 1) {
    offsets.push(glyf.length);
    const glyph = font.getGlyph(gid);
    const decoded = glyph._decode?.() ?? null;
    if (!decoded || decoded.numberOfContours === 0) continue;
    if (decoded.numberOfContours > 0 && decoded.points) {
      const contours: ContourPoint[][] = [];
      let contour: ContourPoint[] = [];
      decoded.points.forEach((point) => {
        contour.push({ x: point.x, y: point.y, on: point.onCurve });
        if (point.endContour) {
          contours.push(contour);
          contour = [];
        }
      });
      if (contour.length) contours.push(contour);
      glyf.bytes(encodeSimpleGlyph(contours).bytes);
    } else if (decoded.components?.length) {
      const box = glyph.cbox;
      glyf.i16(-1);
      glyf.i16(box.minX);
      glyf.i16(box.minY);
      glyf.i16(box.maxX);
      glyf.i16(box.maxY);
      decoded.components.forEach((component, index, all) => {
        let flags = ARG_1_AND_2_ARE_WORDS | ARGS_ARE_XY_VALUES;
        if (index < all.length - 1) flags |= MORE_COMPONENTS;
        const twoByTwo = component.scale01 !== 0 || component.scale10 !== 0;
        if (twoByTwo) flags |= WE_HAVE_A_TWO_BY_TWO;
        else if (component.scaleX !== component.scaleY) flags |= WE_HAVE_AN_X_AND_Y_SCALE;
        else if (component.scaleX !== 1) flags |= WE_HAVE_A_SCALE;
        glyf.u16(flags);
        glyf.u16(component.glyphID);
        glyf.i16(component.dx);
        glyf.i16(component.dy);
        if (twoByTwo) {
          [component.scaleX, component.scale01, component.scale10, component.scaleY].forEach((value) =>
            glyf.i16(f2dot14(value)),
          );
        } else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) {
          glyf.i16(f2dot14(component.scaleX));
          glyf.i16(f2dot14(component.scaleY));
        } else if (flags & WE_HAVE_A_SCALE) {
          glyf.i16(f2dot14(component.scaleX));
        }
      });
    }
    glyf.pad(4);
  }
  offsets.push(glyf.length);
  const loca = new ByteWriter();
  offsets.forEach((offset) => loca.u32(offset));
  tables.set('glyf', glyf.toBytes());
  tables.set('loca', loca.toBytes());
  const head = tables.get('head');
  if (head && head.length >= 54) {
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    view.setUint32(8, 0);
    view.setInt16(50, 1);
  }
  return assembleSfnt(tables);
}

export interface StaticFontNames {
  family: string;
  subfamily: string;
  fullName: string;
  postScriptName: string;
  typographicFamily?: string;
  typographicSubfamily?: string;
  copyright?: string;
  license?: string;
  licenseUrl?: string;
  version?: string;
}

export interface StaticFontSource {
  /** Source font, already instanced at the desired variation. */
  font: FontkitFont;
  /** Original glyph ids to include. */
  glyphIds: Iterable<number>;
  /** Unicode code point to original glyph id; ids must also be in `glyphIds`. */
  codePoints: Map<number, number>;
}

export interface StaticFontOptions {
  /**
   * One or more fonts of the same family and units per em (for example the
   * latin and latin-ext subsets); earlier sources win shared code points.
   */
  sources: StaticFontSource[];
  names: StaticFontNames;
  weightClass: number;
  bold: boolean;
  /** Mark overlapping contours (variable fonts are designed with overlaps). */
  overlap?: boolean;
}

export interface StaticFont {
  bytes: Uint8Array;
  /** Per source: original glyph id to glyph id in `bytes`. */
  glyphMaps: Array<Map<number, number>>;
  /** Advance widths (font units) by new glyph id. */
  advances: number[];
  unitsPerEm: number;
}

/** Writes a standalone static TrueType font with flattened, instanced outlines. */
export function buildStaticFont(options: StaticFontOptions): StaticFont {
  const primary = options.sources[0].font;
  const order: Array<{ source: number; gid: number }> = [{ source: 0, gid: 0 }];
  const glyphMaps = options.sources.map(() => new Map<number, number>());
  glyphMaps[0].set(0, 0);
  options.sources.forEach((source, sourceIndex) => {
    Array.from(new Set(source.glyphIds))
      .filter((gid) => gid > 0 && gid < source.font.numGlyphs)
      .sort((a, b) => a - b)
      .forEach((gid) => {
        glyphMaps[sourceIndex].set(gid, order.length);
        order.push({ source: sourceIndex, gid });
      });
  });

  const glyf = new ByteWriter();
  const offsets: number[] = [];
  const advances: number[] = [];
  const leftBearings: number[] = [];
  let maxPoints = 0;
  let maxContours = 0;
  const total: GlyphBounds = { xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity };
  let minLsb = Infinity;
  let minRsb = Infinity;
  let maxExtent = -Infinity;
  order.forEach(({ source, gid }) => {
    offsets.push(glyf.length);
    const glyph = options.sources[source].font.getGlyph(gid);
    const advance = Math.max(0, Math.round(glyph.advanceWidth));
    advances.push(advance);
    const contours = pathToContours(glyph.path.commands);
    if (!contours.length) {
      leftBearings.push(0);
      return;
    }
    const encoded = encodeSimpleGlyph(contours, options.overlap);
    glyf.bytes(encoded.bytes);
    glyf.pad(4);
    const { bounds } = encoded;
    leftBearings.push(bounds.xMin);
    maxPoints = Math.max(maxPoints, encoded.points);
    maxContours = Math.max(maxContours, contours.length);
    total.xMin = Math.min(total.xMin, bounds.xMin);
    total.yMin = Math.min(total.yMin, bounds.yMin);
    total.xMax = Math.max(total.xMax, bounds.xMax);
    total.yMax = Math.max(total.yMax, bounds.yMax);
    minLsb = Math.min(minLsb, bounds.xMin);
    minRsb = Math.min(minRsb, advance - bounds.xMax);
    maxExtent = Math.max(maxExtent, bounds.xMax);
  });
  offsets.push(glyf.length);
  if (!Number.isFinite(total.xMin)) Object.assign(total, { xMin: 0, yMin: 0, xMax: 0, yMax: 0 });

  const tables = new Map<string, Uint8Array>();
  tables.set('glyf', glyf.toBytes());
  const loca = new ByteWriter();
  offsets.forEach((offset) => loca.u32(offset));
  tables.set('loca', loca.toBytes());

  const hmtx = new ByteWriter();
  order.forEach((_, index) => {
    hmtx.u16(advances[index]);
    hmtx.i16(leftBearings[index]);
  });
  tables.set('hmtx', hmtx.toBytes());

  tables.set('head', buildHead(primary, total, options.bold));
  tables.set('hhea', buildHhea(primary, Math.max(0, ...advances), finiteOr(minLsb, 0), finiteOr(minRsb, 0), finiteOr(maxExtent, 0), order.length));
  tables.set('maxp', buildMaxp(order.length, maxPoints, maxContours));

  const mapped = new Map<number, number>();
  options.sources.forEach((source, sourceIndex) => {
    source.codePoints.forEach((gid, codePoint) => {
      const next = glyphMaps[sourceIndex].get(gid);
      if (next !== undefined && next > 0 && !mapped.has(codePoint)) mapped.set(codePoint, next);
    });
  });
  tables.set('cmap', buildCmap(mapped));
  tables.set('OS/2', buildOs2(primary, options, mapped));
  tables.set('post', buildPost(primary));
  tables.set('name', buildName(options.names));

  return { bytes: assembleSfnt(tables), glyphMaps, advances, unitsPerEm: primary.unitsPerEm };
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function buildHead(font: FontkitFont, bounds: GlyphBounds, bold: boolean): Uint8Array {
  const raw = readRawTable(font, 'head');
  const head = raw && raw.length >= 54 ? raw : new Uint8Array(54);
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (!raw) {
    view.setUint32(0, 0x00010000);
    view.setUint32(4, 0x00010000);
    view.setUint32(12, 0x5f0f3cf5);
    view.setUint16(18, font.unitsPerEm);
  }
  view.setUint32(8, 0);
  view.setInt16(36, clampInt16(bounds.xMin));
  view.setInt16(38, clampInt16(bounds.yMin));
  view.setInt16(40, clampInt16(bounds.xMax));
  view.setInt16(42, clampInt16(bounds.yMax));
  view.setUint16(44, bold ? 0x0001 : 0);
  view.setInt16(50, 1);
  view.setInt16(52, 0);
  return head.slice(0, 54);
}

function buildHhea(
  font: FontkitFont,
  advanceMax: number,
  minLsb: number,
  minRsb: number,
  maxExtent: number,
  numberOfMetrics: number,
): Uint8Array {
  const writer = new ByteWriter();
  writer.u32(0x00010000);
  writer.i16(font.hhea.ascent);
  writer.i16(font.hhea.descent);
  writer.i16(font.hhea.lineGap);
  writer.u16(advanceMax);
  writer.i16(minLsb);
  writer.i16(minRsb);
  writer.i16(maxExtent);
  writer.i16(1);
  writer.i16(0);
  writer.i16(0);
  for (let index = 0; index < 4; index += 1) writer.i16(0);
  writer.i16(0);
  writer.u16(numberOfMetrics);
  return writer.toBytes();
}

function buildMaxp(numGlyphs: number, maxPoints: number, maxContours: number): Uint8Array {
  const writer = new ByteWriter();
  writer.u32(0x00010000);
  writer.u16(numGlyphs);
  writer.u16(maxPoints);
  writer.u16(maxContours);
  writer.u16(0);
  writer.u16(0);
  writer.u16(2);
  for (let index = 0; index < 7; index += 1) writer.u16(0);
  return writer.toBytes();
}

function buildOs2(font: FontkitFont, options: StaticFontOptions, cmap: Map<number, number>): Uint8Array {
  const raw = readRawTable(font, 'OS/2');
  const bmp = Array.from(cmap.keys()).filter((codePoint) => codePoint <= 0xffff);
  const first = bmp.length ? Math.min(...bmp) : 0x20;
  const last = bmp.length ? Math.max(...bmp) : 0x20;
  if (raw && raw.length >= 78) {
    const table = raw.slice();
    const view = new DataView(table.buffer);
    view.setUint16(4, options.weightClass);
    const keep = view.getUint16(62) & 0x0180;
    view.setUint16(62, keep | (options.bold ? 0x0020 : 0x0040));
    view.setUint16(64, first);
    view.setUint16(66, last);
    return table;
  }
  // Version 4 table with neutral metrics for sources without OS/2.
  const writer = new ByteWriter();
  writer.u16(4);
  writer.i16(Math.round(font.unitsPerEm / 2));
  writer.u16(options.weightClass);
  writer.u16(5);
  writer.u16(0);
  for (let index = 0; index < 10; index += 1) writer.i16(0);
  writer.i16(0);
  for (let index = 0; index < 10; index += 1) writer.u8(0);
  for (let index = 0; index < 4; index += 1) writer.u32(0);
  writer.u32(0x4c575254);
  writer.u16(options.bold ? 0x0020 : 0x0040);
  writer.u16(first);
  writer.u16(last);
  writer.i16(font.ascent);
  writer.i16(font.descent);
  writer.i16(font.lineGap);
  writer.u16(Math.max(0, font.ascent));
  writer.u16(Math.max(0, -font.descent));
  writer.u32(1);
  writer.u32(0);
  writer.i16(0);
  writer.i16(0);
  writer.u16(0);
  writer.u16(0x20);
  writer.u16(0);
  return writer.toBytes();
}

function buildPost(font: FontkitFont): Uint8Array {
  const writer = new ByteWriter();
  writer.u32(0x00030000);
  writer.u32(0);
  writer.i16(font.underlinePosition);
  writer.i16(font.underlineThickness);
  writer.u32(font.post?.isFixedPitch ? 1 : 0);
  for (let index = 0; index < 4; index += 1) writer.u32(0);
  return writer.toBytes();
}

function buildName(names: StaticFontNames): Uint8Array {
  const records: Array<[number, string]> = [];
  const add = (id: number, value?: string) => {
    if (value) records.push([id, value]);
  };
  add(0, names.copyright);
  add(1, names.family);
  add(2, names.subfamily);
  add(3, `${names.postScriptName};LWrite export`);
  add(4, names.fullName);
  add(5, names.version ?? 'Version 1.000');
  add(6, names.postScriptName);
  add(13, names.license);
  add(14, names.licenseUrl);
  add(16, names.typographicFamily);
  add(17, names.typographicSubfamily);
  const encoded = records.map(([id, value]) => {
    const bytes = new Uint8Array(value.length * 2);
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      bytes[index * 2] = code >> 8;
      bytes[index * 2 + 1] = code & 0xff;
    }
    return { id, bytes };
  });
  const writer = new ByteWriter();
  writer.u16(0);
  writer.u16(encoded.length);
  writer.u16(6 + encoded.length * 12);
  let offset = 0;
  encoded.forEach(({ id, bytes }) => {
    writer.u16(3);
    writer.u16(1);
    writer.u16(0x0409);
    writer.u16(id);
    writer.u16(bytes.length);
    writer.u16(offset);
    offset += bytes.length;
  });
  encoded.forEach(({ bytes }) => writer.bytes(bytes));
  return writer.toBytes();
}

/** cmap with a format 4 (BMP) subtable and, when needed, format 12 for supplementary planes. */
export function buildCmap(mapping: Map<number, number>): Uint8Array {
  const entries = Array.from(mapping.entries()).sort((a, b) => a[0] - b[0]);
  const format4 = buildCmapFormat4(entries.filter(([codePoint]) => codePoint <= 0xfffe));
  const needs12 = entries.some(([codePoint]) => codePoint > 0xffff);
  const format12 = needs12 ? buildCmapFormat12(entries) : null;
  const records: Array<[number, number, Uint8Array]> = [
    [0, 3, format4],
    ...(format12 ? ([[0, 4, format12]] as Array<[number, number, Uint8Array]>) : []),
    [3, 1, format4],
    ...(format12 ? ([[3, 10, format12]] as Array<[number, number, Uint8Array]>) : []),
  ];
  const writer = new ByteWriter();
  writer.u16(0);
  writer.u16(records.length);
  const unique = Array.from(new Set(records.map(([, , table]) => table)));
  const headerSize = 4 + records.length * 8;
  const offsets = new Map<Uint8Array, number>();
  let offset = headerSize;
  unique.forEach((table) => {
    offsets.set(table, offset);
    offset += table.length;
  });
  records.forEach(([platform, encoding, table]) => {
    writer.u16(platform);
    writer.u16(encoding);
    writer.u32(offsets.get(table) ?? headerSize);
  });
  unique.forEach((table) => writer.bytes(table));
  return writer.toBytes();
}

function buildCmapFormat4(entries: Array<[number, number]>): Uint8Array {
  const segments: Array<{ start: number; end: number; glyphs: number[] }> = [];
  entries.forEach(([codePoint, gid]) => {
    const last = segments[segments.length - 1];
    if (last && last.end + 1 === codePoint) {
      last.end = codePoint;
      last.glyphs.push(gid);
    } else {
      segments.push({ start: codePoint, end: codePoint, glyphs: [gid] });
    }
  });
  const segCount = segments.length + 1;
  const entrySelector = Math.floor(Math.log2(segCount));
  const searchRange = 2 * 2 ** entrySelector;
  const glyphIdArray: number[] = [];
  const deltas: number[] = [];
  const rangeOffsets: number[] = [];
  segments.forEach((segment, index) => {
    const delta = segment.glyphs[0] - segment.start;
    if (segment.glyphs.every((gid, offset) => gid === segment.start + offset + delta)) {
      deltas.push(delta);
      rangeOffsets.push(0);
    } else {
      deltas.push(0);
      // Bytes from this idRangeOffset slot to the segment's first glyphIdArray entry.
      rangeOffsets.push((segCount - index + glyphIdArray.length) * 2);
      glyphIdArray.push(...segment.glyphs);
    }
  });
  const writer = new ByteWriter();
  writer.u16(4);
  writer.u16(16 + segCount * 8 + glyphIdArray.length * 2);
  writer.u16(0);
  writer.u16(segCount * 2);
  writer.u16(searchRange);
  writer.u16(entrySelector);
  writer.u16(segCount * 2 - searchRange);
  segments.forEach((segment) => writer.u16(segment.end));
  writer.u16(0xffff);
  writer.u16(0);
  segments.forEach((segment) => writer.u16(segment.start));
  writer.u16(0xffff);
  deltas.forEach((delta) => writer.u16((delta + 0x10000) & 0xffff));
  writer.u16(1);
  rangeOffsets.forEach((rangeOffset) => writer.u16(rangeOffset));
  writer.u16(0);
  glyphIdArray.forEach((gid) => writer.u16(gid));
  return writer.toBytes();
}

function buildCmapFormat12(entries: Array<[number, number]>): Uint8Array {
  const groups: Array<{ start: number; end: number; glyph: number }> = [];
  entries.forEach(([codePoint, gid]) => {
    const last = groups[groups.length - 1];
    if (last && last.end + 1 === codePoint && last.glyph + (codePoint - last.start) === gid) {
      last.end = codePoint;
    } else {
      groups.push({ start: codePoint, end: codePoint, glyph: gid });
    }
  });
  const writer = new ByteWriter();
  writer.u16(12);
  writer.u16(0);
  writer.u32(16 + groups.length * 12);
  writer.u32(0);
  writer.u32(groups.length);
  groups.forEach((group) => {
    writer.u32(group.start);
    writer.u32(group.end);
    writer.u32(group.glyph);
  });
  return writer.toBytes();
}
