import {
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  PDFString,
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  setTextRenderingMode,
  stroke,
  LineCapStyle,
  LineJoinStyle,
  TextRenderingMode,
  type PDFDocument,
  type PDFHexString,
  type PDFImage,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import { toHex, type RgbaColor } from '../color';
import { resolveFamily } from '../fonts/catalog';
import type { ExportFontRegistry } from '../fonts/registry';
import { shapeText } from '../fonts/shaping';
import { ellipsePath, isGradient, roundedRectPath, type GraphicScene, type PathCommand, type SceneItem, type SceneLinearGradient, type SceneText } from '../graphics/scene';
import { DOCUMENT_STYLE, PX_TO_PT, type PageGeometry, type RunStyle } from '../typography';
import type { PreparedExportImage } from '../types';
import type { FontMetrics, PdfFontSet, PdfTextFont } from './fonts';
import type { Atom, Decoration, Galley, GraphicAtom, ImageAtom, ListMarker, TableAtom } from './galley';
import { baselineShift, type LayoutLine, type LinePiece, type PlacedGlyph, type StyledRun } from './inline';
import type { Page } from './paginate';

export interface DrawEnvironment {
  document: PDFDocument;
  geometry: PageGeometry;
  fonts: PdfFontSet;
  registry: ExportFontRegistry;
  images: Map<PreparedExportImage, PDFImage>;
  /** Images of characters no font covers, keyed by `rasterKey`. */
  rasters: Map<string, PDFImage>;
}

export interface OutlineEntry {
  level: 1 | 2 | 3;
  title: string;
  page: PDFPage;
  /** PDF y of the heading top. */
  top: number;
}

// Chrome slants synthetic italics by a skew of 1/4 (about 14°).
const SYNTHETIC_ITALIC_SKEW = 0.25;

/** Skia's fake-bold outline growth: 1/24 of the size at 9px down to 1/32 at 36px. */
function syntheticBoldStroke(sizePx: number): number {
  const t = Math.max(0, Math.min(1, (sizePx - 9) / 27));
  return sizePx * (1 / 24 + (1 / 32 - 1 / 24) * t);
}

export function rasterKey(text: string, style: RunStyle): string {
  return `${text}|${style.family.name}|${style.weight}|${style.italic}|${style.sizePx}|${style.color}`;
}

function rgbOf(hex: string): [number, number, number] {
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number];
}

function rgbaOf(color: RgbaColor): [number, number, number] {
  return [color.r / 255, color.g / 255, color.b / 255];
}

/** Collects operators and resource names for one PDF page; y grows downwards in px. */
class PageCanvas {
  readonly ops: PDFOperator[] = [];
  private readonly fontNames = new Map<string, PDFName>();
  private readonly alphaNames = new Map<string, PDFName>();
  private readonly imageNames = new Map<PDFRef, PDFName>();
  private shadingCount = 0;
  readonly links: Array<{ href: string; rect: [number, number, number, number] }> = [];

  constructor(
    readonly page: PDFPage,
    readonly env: DrawEnvironment,
  ) {}

  x(px: number): number {
    return this.env.geometry.marginPt + px * PX_TO_PT;
  }

  y(px: number): number {
    return this.env.geometry.heightPt - this.env.geometry.marginPt - px * PX_TO_PT;
  }

  fontName(font: PdfTextFont): PDFName {
    let name = this.fontNames.get(font.key);
    if (!name) {
      name = this.page.node.newFontDictionary('F', font.ref);
      this.fontNames.set(font.key, name);
    }
    return name;
  }

  alpha(fillAlpha: number, strokeAlpha = 1): PDFName | null {
    if (fillAlpha >= 0.999 && strokeAlpha >= 0.999) return null;
    const key = `${fillAlpha.toFixed(3)}|${strokeAlpha.toFixed(3)}`;
    let name = this.alphaNames.get(key);
    if (!name) {
      name = this.page.node.newExtGState(
        'GS',
        this.env.document.context.obj({ Type: 'ExtGState', ca: Number(fillAlpha.toFixed(3)), CA: Number(strokeAlpha.toFixed(3)) }),
      );
      this.alphaNames.set(key, name);
    }
    return name;
  }

  image(image: PDFImage): PDFName {
    let name = this.imageNames.get(image.ref);
    if (!name) {
      name = this.page.node.newXObject('Im', image.ref);
      this.imageNames.set(image.ref, name);
    }
    return name;
  }

  shading(gradient: SceneLinearGradient, map: (x: number, y: number) => [number, number]): PDFName {
    const context = this.env.document.context;
    const [x1, y1] = map(gradient.x1, gradient.y1);
    const [x2, y2] = map(gradient.x2, gradient.y2);
    const stops = gradient.stops;
    const fn = (a: RgbaColor, b: RgbaColor) => context.obj({ FunctionType: 2, Domain: [0, 1], C0: rgbaOf(a), C1: rgbaOf(b), N: 1 });
    const functions = stops.slice(1).map((stop, index) => fn(stops[index].color, stop.color));
    const shadingFunction =
      functions.length === 1
        ? functions[0]
        : context.obj({
            FunctionType: 3,
            Domain: [0, 1],
            Functions: functions,
            Bounds: stops.slice(1, -1).map((stop) => stop.offset),
            Encode: functions.flatMap(() => [0, 1]),
          });
    const shading = context.obj({
      ShadingType: 2,
      ColorSpace: 'DeviceRGB',
      Coords: [x1, y1, x2, y2],
      Function: shadingFunction,
      Extend: [true, true],
    });
    const resources = this.page.node.normalizedEntries().Resources;
    let dict = resources.lookupMaybe(PDFName.of('Shading'), PDFDict);
    if (!dict) {
      dict = context.obj({});
      resources.set(PDFName.of('Shading'), dict);
    }
    this.shadingCount += 1;
    const name = PDFName.of(`Sh${this.shadingCount}`);
    dict.set(name, context.register(shading));
    return name;
  }

  path(commands: PathCommand[], map: (x: number, y: number) => [number, number]): void {
    commands.forEach((command) => {
      switch (command[0]) {
        case 'M':
          this.ops.push(moveTo(...map(command[1], command[2])));
          break;
        case 'L':
          this.ops.push(lineTo(...map(command[1], command[2])));
          break;
        case 'C':
          this.ops.push(appendBezierCurve(...map(command[1], command[2]), ...map(command[3], command[4]), ...map(command[5], command[6])));
          break;
        default:
          this.ops.push(closePath());
      }
    });
  }

  /** Maps document px (relative to the content area) to PDF points. */
  readonly map = (x: number, y: number): [number, number] => [this.x(x), this.y(y)];

  fillRect(x: number, y: number, width: number, height: number, color: string, radius = 0, alpha = 1): void {
    if (width <= 0 || height <= 0) return;
    this.ops.push(pushGraphicsState());
    const gs = this.alpha(alpha);
    if (gs) this.ops.push(setGraphicsState(gs));
    this.ops.push(setFillingRgbColor(...rgbOf(color)));
    const r: [number, number] = [radius, radius];
    this.path(roundedRectPath(x, y, width, height, { tl: r, tr: r, br: r, bl: r }), this.map);
    this.ops.push(fill(), popGraphicsState());
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, width: number): void {
    this.ops.push(
      pushGraphicsState(),
      setStrokingRgbColor(...rgbOf(color)),
      setLineWidth(width * PX_TO_PT),
      moveTo(this.x(x1), this.y(y1)),
      lineTo(this.x(x2), this.y(y2)),
      stroke(),
      popGraphicsState(),
    );
  }

  link(href: string, x: number, top: number, width: number, height: number): void {
    if (!/^(https?:|mailto:)/i.test(href) || width <= 0) return;
    const rect: [number, number, number, number] = [this.x(x), this.y(top + height), this.x(x + width), this.y(top)];
    const last = this.links[this.links.length - 1];
    if (last && last.href === href && Math.abs(last.rect[1] - rect[1]) < 0.5 && Math.abs(last.rect[2] - rect[0]) < 2) {
      last.rect[2] = rect[2];
      last.rect[3] = Math.max(last.rect[3], rect[3]);
      return;
    }
    this.links.push({ href, rect });
  }

  /** Shows glyphs with TJ, correcting each advance to the shaped one (kerning, justification). */
  glyphs(
    font: PdfTextFont,
    sizePx: number,
    glyphs: PlacedGlyph[],
    x: number,
    baseline: number,
    color: string,
    options: { syntheticBold?: boolean; syntheticItalic?: boolean; spaceExtra?: number } = {},
  ): number {
    if (!glyphs.length) return 0;
    const sizePt = sizePx * PX_TO_PT;
    const [r, g, b] = rgbOf(color);
    this.ops.push(beginText(), setFontAndSize(this.fontName(font), sizePt), setFillingRgbColor(r, g, b));
    if (options.syntheticBold) {
      this.ops.push(
        setTextRenderingMode(TextRenderingMode.FillAndOutline),
        setStrokingRgbColor(r, g, b),
        setLineWidth(syntheticBoldStroke(sizePx) * PX_TO_PT),
      );
    }
    const skew = options.syntheticItalic ? SYNTHETIC_ITALIC_SKEW : 0;
    const context = this.env.document.context;
    let pen = x;
    let segment: Array<PDFHexString | PDFNumber> = [];
    let pending: PlacedGlyph[] = [];
    let segmentStarted = false;
    const flushPending = () => {
      if (pending.length) segment.push(font.encode(pending));
      pending = [];
    };
    const flushSegment = () => {
      flushPending();
      if (segment.length) this.ops.push(PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [context.obj(segment) as PDFArray]));
      segment = [];
      segmentStarted = false;
    };
    const start = (atX: number, atY: number) => {
      this.ops.push(setTextMatrix(1, 0, skew, 1, this.x(atX), this.y(atY)));
      segmentStarted = true;
    };
    glyphs.forEach((glyph) => {
      const extra = options.spaceExtra && /^\s+$/u.test(glyph.text) && glyph.text !== ' ' ? options.spaceExtra : 0;
      const advance = glyph.advance + extra;
      if (glyph.xOffset || glyph.yOffset) {
        flushSegment();
        start(pen + glyph.xOffset, baseline - glyph.yOffset);
        this.ops.push(PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [context.obj([font.encode([glyph])]) as PDFArray]));
        pen += advance;
        return;
      }
      if (!segmentStarted) start(pen, baseline);
      pending.push(glyph);
      const natural = (font.defaultAdvance(glyph) / font.metrics.unitsPerEm) * sizePx;
      const correction = ((natural - advance) / sizePx) * 1000;
      if (Math.abs(correction) > 0.01) {
        flushPending();
        segment.push(PDFNumber.of(Math.round(correction * 100) / 100));
      }
      pen += advance;
    });
    flushSegment();
    if (options.syntheticBold) this.ops.push(setTextRenderingMode(TextRenderingMode.Fill));
    this.ops.push(endText());
    return pen - x;
  }

  drawImage(image: PDFImage, x: number, top: number, width: number, height: number, radius = 0): void {
    this.ops.push(pushGraphicsState());
    if (radius > 0) {
      const r: [number, number] = [radius, radius];
      this.path(roundedRectPath(x, top, width, height, { tl: r, tr: r, br: r, bl: r }), this.map);
      this.ops.push(clip(), endPath());
    }
    this.ops.push(
      concatTransformationMatrix(width * PX_TO_PT, 0, 0, height * PX_TO_PT, this.x(x), this.y(top + height)),
      drawObject(this.image(image)),
      popGraphicsState(),
    );
  }

  finish(): void {
    this.page.pushOperators(...this.ops);
    const context = this.env.document.context;
    this.links.forEach(({ href, rect }) => {
      const annotation = context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: rect,
        Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(href) },
      });
      this.page.node.addAnnot(context.register(annotation));
    });
  }
}

function pieceMetrics(metrics: FontMetrics, sizePx: number) {
  const scale = sizePx / metrics.unitsPerEm;
  return {
    ascent: metrics.ascent * scale,
    descent: -metrics.descent * scale,
    underline: -metrics.underlinePosition * scale,
    thickness: Math.max(1, metrics.underlineThickness * scale),
    strike: metrics.strikeoutPosition * scale,
    strikeSize: Math.max(1, metrics.strikeoutSize * scale),
  };
}

function drawLine(canvas: PageCanvas, line: LayoutLine, runs: StyledRun[], left: number, top: number): void {
  const start = left + line.inset + line.offset;
  const baseline = top + line.baseline;
  // Highlights first so text and decorations paint over them.
  line.pieces.forEach((piece) => {
    const style = runs[piece.run].style;
    if (!style.highlight) return;
    const metrics = pieceMetrics(piece.metrics, style.sizePx);
    const shift = baselineShift(style);
    const mark = DOCUMENT_STYLE.mark;
    canvas.fillRect(
      start + piece.x - piece.padStart,
      baseline + shift - metrics.ascent - mark.paddingY,
      piece.width + piece.padStart + piece.padEnd,
      metrics.ascent + metrics.descent + mark.paddingY * 2,
      style.highlight,
      mark.radius,
    );
  });
  line.pieces.forEach((piece) => drawPiece(canvas, piece, runs[piece.run], start, baseline, top, line.height));
}

function drawPiece(canvas: PageCanvas, piece: LinePiece, run: StyledRun, start: number, baseline: number, lineTop: number, lineHeight: number): void {
  const { style } = run;
  const x = start + piece.x;
  const shift = baselineShift(style);
  const resolution = canvas.env.registry.resolve({ family: style.family, weight: style.weight, italic: style.italic });
  if (piece.missing) {
    const image = canvas.env.rasters.get(rasterKey(piece.missing.text, style));
    if (image) {
      canvas.drawImage(image, x, baseline + shift - piece.missing.ascent, piece.missing.width, piece.missing.ascent + piece.missing.descent);
    }
  } else if (piece.font) {
    canvas.glyphs(piece.font, style.sizePx, piece.glyphs, x, baseline + shift, style.color, {
      syntheticBold: piece.font.synthesizes && resolution.syntheticBold,
      syntheticItalic: piece.font.synthesizes && resolution.syntheticItalic,
      spaceExtra: piece.spaceExtra,
    });
  }
  const metrics = pieceMetrics(piece.metrics, style.sizePx);
  if (style.underline) {
    // Links use `text-underline-offset: 3px`; other underlines follow the font.
    const offset = style.link ? 3 + metrics.thickness / 2 : metrics.underline;
    canvas.line(x, baseline + shift + offset, x + piece.width, baseline + shift + offset, style.color, metrics.thickness);
  }
  if (style.strike) {
    const y = baseline + shift - metrics.strike + metrics.strikeSize / 2;
    canvas.line(x, y, x + piece.width, y, style.color, metrics.strikeSize);
  }
  if (run.href) canvas.link(run.href, x - piece.padStart, lineTop, piece.width + piece.padStart + piece.padEnd, lineHeight);
}

function drawMarker(canvas: PageCanvas, marker: ListMarker, originX: number, baseline: number): void {
  // Markers use the list item's font size, not the size of styled text inside it.
  const sizePx = marker.run.style.sizePx;
  const color = marker.run.style.color;
  const right = originX + marker.right;
  const space = sizePx * 0.26;
  if (marker.kind === 'number') {
    const resolution = canvas.env.registry.resolve({ family: marker.run.style.family, weight: 400, italic: false });
    const segments = shapeText(marker.text, resolution, canvas.env.registry.fallbackFor(400, false));
    const width = segments.reduce(
      (sum, segment) => sum + (segment.font ? segment.glyphs.reduce((total, glyph) => total + glyph.advance, 0) * (sizePx / segment.font.font.unitsPerEm) : 0),
      0,
    );
    let x = right - space - width;
    segments.forEach((segment) => {
      if (!segment.font) return;
      const font = canvas.env.fonts.forLoaded(segment.font);
      const factor = sizePx / segment.font.font.unitsPerEm;
      x += canvas.glyphs(
        font,
        sizePx,
        segment.glyphs.map((glyph) => ({ id: glyph.id, text: segment.text.slice(glyph.cluster - segment.start, glyph.cluster - segment.start + 1), advance: glyph.advance * factor, xOffset: 0, yOffset: 0 })),
        x,
        baseline,
        color,
      );
    });
    return;
  }
  // Bullets as drawn by Chrome: a disc, a hollow circle and a small square, centered on the x-height.
  const radius = sizePx * 0.165;
  const cx = right - space - radius - sizePx * 0.06;
  const cy = baseline - sizePx * 0.29;
  const [r, g, b] = rgbOf(color);
  canvas.ops.push(pushGraphicsState(), setFillingRgbColor(r, g, b), setStrokingRgbColor(r, g, b));
  if (marker.kind === 'square') {
    const side = radius * 1.8;
    canvas.path(roundedRectPath(cx - side / 2, cy - side / 2, side, side), canvas.map);
    canvas.ops.push(fill());
  } else if (marker.kind === 'circle') {
    canvas.ops.push(setLineWidth(PX_TO_PT));
    canvas.path(ellipsePath(cx, cy, radius - 0.5, radius - 0.5), canvas.map);
    canvas.ops.push(stroke());
  } else {
    canvas.path(ellipsePath(cx, cy, radius, radius), canvas.map);
    canvas.ops.push(fill());
  }
  canvas.ops.push(popGraphicsState());
}

function drawDecoration(canvas: PageCanvas, decoration: Decoration, top: number, bottom: number, originX: number): void {
  if (decoration.kind === 'quote-bar') {
    canvas.fillRect(originX + decoration.x, top, decoration.width, bottom - top, decoration.color);
  } else {
    canvas.fillRect(originX + decoration.x, top, decoration.width, bottom - top, decoration.color, decoration.radius);
  }
}

function drawImageAtom(canvas: PageCanvas, atom: ImageAtom, originX: number, top: number): void {
  const prepared = atom.image.prepared;
  const image = prepared ? canvas.env.images.get(prepared) : undefined;
  if (!image) return;
  canvas.drawImage(image, originX + atom.x, top, atom.width, atom.height, DOCUMENT_STYLE.image.radius);
}

function drawGraphicAtom(canvas: PageCanvas, atom: GraphicAtom, originX: number, top: number): void {
  const frame = DOCUMENT_STYLE.graphic;
  const x = originX + atom.x;
  // The editor's graphic frame: white card, 1px border, 12px radius, 20px padding.
  canvas.fillRect(x, top, atom.width, atom.height, frame.background, frame.radius);
  const half = frame.borderWidth / 2;
  canvas.ops.push(pushGraphicsState(), setStrokingRgbColor(...rgbOf(frame.borderColor)), setLineWidth(frame.borderWidth * PX_TO_PT));
  const r: [number, number] = [frame.radius - half, frame.radius - half];
  canvas.path(roundedRectPath(x + half, top + half, atom.width - frame.borderWidth, atom.height - frame.borderWidth, { tl: r, tr: r, br: r, bl: r }), canvas.map);
  canvas.ops.push(stroke(), popGraphicsState());
  const inner = atom.width - (frame.padding + frame.borderWidth) * 2;
  const contentWidth = atom.scene.width * atom.scale;
  const ox = x + frame.padding + frame.borderWidth + (inner - contentWidth) / 2;
  const oy = top + frame.padding + frame.borderWidth;
  drawScene(canvas, atom.scene, ox, oy, atom.scale);
}

/** Draws a captured Smart Graphic scene at (x, y) px with `scale`. */
export function drawScene(canvas: PageCanvas, scene: GraphicScene, x: number, y: number, scale: number): void {
  const map = (px: number, py: number): [number, number] => canvas.map(x + px * scale, y + py * scale);
  const visit = (items: SceneItem[]) => {
    items.forEach((item) => {
      if (item.kind === 'group') {
        canvas.ops.push(pushGraphicsState());
        if (item.clip) {
          canvas.path(item.clip, map);
          canvas.ops.push(clip(), endPath());
        }
        visit(item.items);
        canvas.ops.push(popGraphicsState());
        return;
      }
      if (item.kind === 'text') {
        drawSceneText(canvas, item, x, y, scale);
        return;
      }
      // PDF has no blur: soft shadows are left out.
      if (item.blur) return;
      if (item.fill) {
        canvas.ops.push(pushGraphicsState());
        if (isGradient(item.fill)) {
          canvas.path(item.path, map);
          canvas.ops.push(clip(), endPath(), PDFOperator.of(PDFOperatorNames.ShadingFill, [canvas.shading(item.fill, map)]));
        } else {
          const gs = canvas.alpha(item.fill.a);
          if (gs) canvas.ops.push(setGraphicsState(gs));
          canvas.ops.push(setFillingRgbColor(...rgbaOf(item.fill)));
          canvas.path(item.path, map);
          canvas.ops.push(fill());
        }
        canvas.ops.push(popGraphicsState());
      }
      if (item.stroke) {
        canvas.ops.push(pushGraphicsState());
        const gs = canvas.alpha(1, item.stroke.color.a);
        if (gs) canvas.ops.push(setGraphicsState(gs));
        canvas.ops.push(
          setStrokingRgbColor(...rgbaOf(item.stroke.color)),
          setLineWidth(item.stroke.width * scale * PX_TO_PT),
          setLineCap(item.stroke.cap === 'round' ? LineCapStyle.Round : item.stroke.cap === 'square' ? LineCapStyle.Projecting : LineCapStyle.Butt),
          setLineJoin(item.stroke.join === 'round' ? LineJoinStyle.Round : item.stroke.join === 'bevel' ? LineJoinStyle.Bevel : LineJoinStyle.Miter),
        );
        if (item.stroke.dash?.length) canvas.ops.push(setDashPattern(item.stroke.dash.map((value) => value * scale * PX_TO_PT), 0));
        canvas.path(item.path, map);
        canvas.ops.push(stroke(), popGraphicsState());
      }
    });
  };
  visit(scene.items);
}

function drawSceneText(canvas: PageCanvas, item: SceneText, originX: number, originY: number, scale: number): void {
  const family = resolveFamily(item.font.family);
  const resolution = canvas.env.registry.resolve({ family, weight: item.font.weight, italic: item.font.italic });
  const sizePx = item.font.size * scale;
  const segments = shapeText(item.text, resolution, canvas.env.registry.fallbackFor(item.font.weight, item.font.italic));
  const pieces = segments
    .filter((segment) => segment.font)
    .map((segment) => {
      const loaded = segment.font as NonNullable<typeof segment.font>;
      const factor = sizePx / loaded.font.unitsPerEm;
      const glyphs: PlacedGlyph[] = segment.glyphs.map((glyph, index) => {
        const next = segment.glyphs[index + 1];
        const end = next && next.cluster > glyph.cluster ? next.cluster : glyph.cluster === segment.glyphs[index - 1]?.cluster ? glyph.cluster : segment.end;
        return {
          id: glyph.id,
          text: index > 0 && segment.glyphs[index - 1].cluster === glyph.cluster ? '' : item.text.slice(glyph.cluster, Math.max(end, glyph.cluster + 1)),
          advance: glyph.advance * factor,
          xOffset: glyph.xOffset * factor,
          yOffset: glyph.yOffset * factor,
        };
      });
      return { font: canvas.env.fonts.forLoaded(loaded), glyphs, width: glyphs.reduce((sum, glyph) => sum + glyph.advance, 0) };
    });
  const total = pieces.reduce((sum, piece) => sum + piece.width, 0);
  const anchorX = originX + item.x * scale;
  let x = item.anchor === 'middle' ? anchorX - total / 2 : item.anchor === 'end' ? anchorX - total : anchorX;
  const color = [item.color.r, item.color.g, item.color.b].map((value) => value.toString(16).padStart(2, '0')).join('');
  const gs = canvas.alpha(item.color.a);
  if (gs) canvas.ops.push(pushGraphicsState(), setGraphicsState(gs));
  pieces.forEach((piece) => {
    x += canvas.glyphs(piece.font, sizePx, piece.glyphs, x, originY + item.y * scale, color, {
      syntheticBold: piece.font.synthesizes && resolution.syntheticBold,
      syntheticItalic: piece.font.synthesizes && resolution.syntheticItalic,
    });
  });
  if (gs) canvas.ops.push(popGraphicsState());
}

function drawTableAtom(canvas: PageCanvas, atom: TableAtom, originX: number, top: number): void {
  const style = DOCUMENT_STYLE.table;
  const x = originX + atom.x;
  // Cell fills: the editor tints every cell, headers slightly darker.
  atom.cells.forEach((cell) => {
    const color = toHex(cell.background) ?? (cell.header ? style.headerBackground : style.cellBackground);
    canvas.fillRect(x + cell.x, top + cell.y, cell.width, cell.height, color);
  });
  atom.cells.forEach((cell) => {
    canvas.ops.push(pushGraphicsState());
    canvas.path(roundedRectPath(x + cell.x, top + cell.y, cell.width, cell.height), canvas.map);
    canvas.ops.push(clip(), endPath());
    const contentX = x + cell.x + style.cellPaddingX + style.borderWidth / 2;
    const contentTop = top + cell.y + style.cellPaddingY + style.borderWidth / 2 + cell.contentOffset;
    drawGalley(canvas, cell.galley, contentX, contentTop, { from: top + cell.y, to: top + cell.y + cell.height });
    canvas.ops.push(popGraphicsState());
  });
  if (atom.borders === 'visible') {
    const color = DOCUMENT_STYLE.borderColor;
    atom.cells.forEach((cell) => {
      const left = x + cell.x;
      const cellTop = top + cell.y;
      canvas.ops.push(pushGraphicsState(), setStrokingRgbColor(...rgbOf(color)), setLineWidth(style.borderWidth * PX_TO_PT));
      canvas.path(roundedRectPath(left, cellTop, cell.width, cell.height), canvas.map);
      canvas.ops.push(stroke(), popGraphicsState());
    });
  }
}

/** Draws a (nested) galley; `clipRange` limits atoms to a vertical range (split table cells). */
export function drawGalley(canvas: PageCanvas, galley: Galley, originX: number, originY: number, clipRange?: { from: number; to: number }): void {
  galley.decorations.forEach((decoration) => {
    const first = galley.atoms[decoration.first];
    const last = galley.atoms[decoration.last];
    if (!first || !last) return;
    drawDecoration(canvas, decoration, originY + first.y - decoration.padTop, originY + last.y + last.height + decoration.padBottom, originX);
  });
  galley.atoms.forEach((atom) => {
    const top = originY + atom.y;
    if (clipRange && (top + atom.height <= clipRange.from + 0.5 || top >= clipRange.to - 0.5)) return;
    drawAtom(canvas, atom, originX, top);
  });
}

export function drawAtom(canvas: PageCanvas, atom: Atom, originX: number, top: number): void {
  switch (atom.kind) {
    case 'line': {
      drawLine(canvas, atom.line, atom.runs, originX + atom.x, top);
      if (atom.marker) drawMarker(canvas, atom.marker, originX, top + atom.line.baseline);
      break;
    }
    case 'image':
      drawImageAtom(canvas, atom, originX, top);
      if (atom.marker) drawMarker(canvas, atom.marker, originX, top + atom.marker.run.style.sizePx * 1.2);
      break;
    case 'graphic':
      drawGraphicAtom(canvas, atom, originX, top);
      if (atom.marker) drawMarker(canvas, atom.marker, originX, top + atom.marker.run.style.sizePx * 1.2);
      break;
    case 'rule':
      canvas.fillRect(originX + atom.x, top, atom.width, atom.height, DOCUMENT_STYLE.borderColor);
      break;
    case 'table':
      drawTableAtom(canvas, atom, originX, top);
      if (atom.marker) drawMarker(canvas, atom.marker, originX, top + atom.marker.run.style.sizePx * 1.2);
      break;
  }
}

/** Draws paginated content; returns heading positions for the outline. */
export function drawPages(env: DrawEnvironment, pages: Page[]): OutlineEntry[] {
  const outline: OutlineEntry[] = [];
  pages.forEach((page) => {
    const pdfPage = env.document.addPage([env.geometry.widthPt, env.geometry.heightPt]);
    const canvas = new PageCanvas(pdfPage, env);
    page.decorations.forEach((piece) => drawDecoration(canvas, piece.decoration, piece.top, piece.bottom, 0));
    page.atoms.forEach(({ atom, top }) => {
      drawAtom(canvas, atom, 0, top);
      if (atom.kind === 'line' && atom.heading) {
        outline.push({ level: atom.heading.level, title: atom.heading.text, page: pdfPage, top: canvas.y(top) });
      }
    });
    canvas.finish();
  });
  return outline;
}

export type { PageCanvas };
