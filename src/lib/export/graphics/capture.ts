import { createElement } from 'react';
import type { Locale } from '@/lib/translations';
import { t } from '@/lib/translations';
import type { SmartGraphicModel } from '@/lib/smartGraphic';
import { resolveCssColor, type RgbaColor } from '../color';
import { primaryFamilyName } from '../fonts/catalog';
import {
  clipPathShape,
  cornerRadii,
  evalLength,
  expandRadii,
  hasRadius,
  insetRadii,
  parseBoxShadows,
  parseDropShadowFilter,
  parseLinearGradient,
  parseSvgPath,
} from './cssGeometry';
import {
  ellipsePath,
  isFinitePath,
  polygonPath,
  roundedRectPath,
  transformPath,
  type CornerRadii,
  type GraphicScene,
  type PathCommand,
  type ScenePaint,
  type SceneItem,
  type SceneShadow,
  type SceneText,
} from './scene';

/**
 * Captures a Smart Graphic as a vector scene by mounting the editor's own
 * renderer (`SmartGraphicCanvas`, the layout registry and the app CSS)
 * off-screen and reading the laid-out boxes back. No layout is
 * re-implemented here: this module only translates computed CSS (boxes,
 * radii, clip-path polygons, borders, shadows, gradients, SVG elements and
 * text line boxes) into drawing instructions. It needs a real browser layout
 * engine; elsewhere it returns null and exporters fall back to an outline.
 */

/** Width the graphic is laid out at; wide enough for every layout's desktop arrangement. */
export const GRAPHIC_CAPTURE_MIN_WIDTH = 600;

type Matrix = [number, number, number, number, number, number];

interface CaptureContext {
  originX: number;
  originY: number;
  opacity: number;
  shadow?: SceneShadow;
  out: SceneItem[];
  /** Positioned elements with a positive z-index paint after their siblings. */
  raised: SceneItem[];
}

export function canCaptureGraphics(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (/jsdom/i.test(navigator.userAgent)) return false;
  return typeof document.createRange === 'function';
}

let metricsCanvas: CanvasRenderingContext2D | null | undefined;
const ascentCache = new Map<string, number>();

/** Distance from the top of a text box to its baseline, as the browser lays text out. */
function fontAscent(style: CSSStyleDeclaration, fontSize: number): number {
  const key = `${style.fontStyle}|${style.fontWeight}|${fontSize}|${style.fontFamily}`;
  const cached = ascentCache.get(key);
  if (cached !== undefined) return cached;
  if (metricsCanvas === undefined) metricsCanvas = document.createElement('canvas').getContext('2d');
  let ascent = fontSize * 0.8;
  if (metricsCanvas) {
    metricsCanvas.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    const metrics = metricsCanvas.measureText('Hg');
    if (Number.isFinite(metrics.fontBoundingBoxAscent) && metrics.fontBoundingBoxAscent > 0) {
      ascent = metrics.fontBoundingBoxAscent;
    }
  }
  ascentCache.set(key, ascent);
  return ascent;
}

/**
 * An SVG paint or border color. Browsers resolve `currentColor` in computed
 * styles; the keyword is mapped to the element's color in case one does not.
 */
function paintColor(value: string, style: CSSStyleDeclaration): RgbaColor | null {
  return resolveCssColor(/^currentcolor$/i.test(value.trim()) ? style.color : value);
}

function withOpacity(color: RgbaColor, opacity: number): RgbaColor {
  return { ...color, a: color.a * opacity };
}

function visible(color: RgbaColor | null): color is RgbaColor {
  return Boolean(color && color.a > 0.001);
}

function isRotatedOrFlipped(style: CSSStyleDeclaration): boolean {
  if (style.rotate && style.rotate !== 'none' && Number.parseFloat(style.rotate) !== 0) return true;
  if (style.scale && style.scale !== 'none' && style.scale.includes('-')) return true;
  if (style.transform && style.transform !== 'none') {
    const match = style.transform.match(/matrix\(([^)]+)\)/);
    if (match) {
      const [a, b, c, d] = match[1].split(',').map(Number.parseFloat);
      return Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || a < 0 || d < 0;
    }
  }
  return false;
}

/** Paints an element's own box: outer rings, background, inset rings, borders. */
function paintBox(
  style: CSSStyleDeclaration,
  box: { x: number; y: number; width: number; height: number },
  context: CaptureContext,
  target: SceneItem[],
): void {
  const { x, y, width, height } = box;
  if (width <= 0 || height <= 0) return;
  const radii = cornerRadii(style, width, height);
  const clip = clipPathShape(style.clipPath, x, y, width, height);
  const outline = clip ?? roundedRectPath(x, y, width, height, radii);
  const shadows = parseBoxShadows(style.boxShadow);

  // Spread-only outer shadows are halos (e.g. around timeline dots).
  shadows
    .filter((shadow) => !shadow.inset && shadow.blur === 0 && shadow.spread > 0)
    .forEach((shadow) => {
      const spread = shadow.spread;
      target.push({
        kind: 'shape',
        path: roundedRectPath(
          x - spread + shadow.dx,
          y - spread + shadow.dy,
          width + spread * 2,
          height + spread * 2,
          expandRadii(radii, spread),
        ),
        fill: withOpacity(shadow.color, context.opacity),
      });
    });
  // Soft box-shadows become blurred copies of the box (spread may be negative).
  shadows
    .filter((soft) => !soft.inset && soft.blur > 0)
    .forEach((soft) => {
      const spread = soft.spread;
      const shadowWidth = width + spread * 2;
      const shadowHeight = height + spread * 2;
      if (shadowWidth <= 0 || shadowHeight <= 0) return;
      target.push({
        kind: 'shape',
        path: roundedRectPath(x - spread + soft.dx, y - spread + soft.dy, shadowWidth, shadowHeight, spread >= 0 ? expandRadii(radii, spread) : insetRadii(radii, -spread)),
        fill: withOpacity(soft.color, context.opacity),
        blur: soft.blur,
      });
    });
  const shadow = context.shadow;

  const background = resolveCssColor(style.backgroundColor);
  const gradient = style.backgroundImage.includes('linear-gradient')
    ? parseLinearGradient(style.backgroundImage, x, y, width, height)
    : null;
  let fill: ScenePaint | undefined;
  if (gradient) {
    fill = { ...gradient, stops: gradient.stops.map((stop) => ({ ...stop, color: withOpacity(stop.color, context.opacity) })) };
  } else if (visible(background)) {
    fill = withOpacity(background, context.opacity);
  }
  if (fill) target.push({ kind: 'shape', path: outline, fill, ...(shadow ? { shadow } : {}) });

  shadows
    .filter((ring) => ring.inset && ring.blur === 0 && ring.spread > 0)
    .forEach((ring) => {
      const half = ring.spread / 2;
      target.push({
        kind: 'shape',
        path: clip ?? roundedRectPath(x + half, y + half, width - ring.spread, height - ring.spread, insetRadii(radii, half)),
        stroke: { color: withOpacity(ring.color, context.opacity), width: ring.spread },
      });
    });

  // Offset inset shadows without blur draw hairlines inside an edge (row dividers).
  shadows
    .filter((line) => line.inset && line.blur === 0 && line.spread === 0 && (line.dx || line.dy))
    .forEach((line) => {
      const color = withOpacity(line.color, context.opacity);
      const strip = (sx: number, sy: number, sw: number, sh: number) => {
        if (sw > 0 && sh > 0) target.push({ kind: 'shape', path: roundedRectPath(sx, sy, sw, sh), fill: color });
      };
      if (line.dy > 0) strip(x, y, width, line.dy);
      if (line.dy < 0) strip(x, y + height + line.dy, width, -line.dy);
      if (line.dx > 0) strip(x, y, line.dx, height);
      if (line.dx < 0) strip(x + width + line.dx, y, -line.dx, height);
    });

  paintBorders(style, { x, y, width, height }, radii, context, target);
}

function paintBorders(
  style: CSSStyleDeclaration,
  box: { x: number; y: number; width: number; height: number },
  radii: CornerRadii,
  context: CaptureContext,
  target: SceneItem[],
): void {
  const side = (name: 'Top' | 'Right' | 'Bottom' | 'Left') => {
    const width = Number.parseFloat(style.getPropertyValue(`border-${name.toLowerCase()}-width`)) || 0;
    const borderStyle = style.getPropertyValue(`border-${name.toLowerCase()}-style`);
    const color = paintColor(style.getPropertyValue(`border-${name.toLowerCase()}-color`), style);
    return width > 0 && borderStyle !== 'none' && borderStyle !== 'hidden' && visible(color)
      ? { width, color: withOpacity(color, context.opacity), dashed: borderStyle === 'dashed' || borderStyle === 'dotted' }
      : null;
  };
  const top = side('Top');
  const right = side('Right');
  const bottom = side('Bottom');
  const left = side('Left');
  const sides = [top, right, bottom, left];
  if (sides.every((entry) => !entry)) return;
  const { x, y, width, height } = box;
  const uniform =
    sides.every((entry) => entry) &&
    sides.every((entry) => entry?.width === top?.width && sameColor(entry?.color, top?.color) && entry?.dashed === top?.dashed);
  if (uniform && top) {
    const half = top.width / 2;
    target.push({
      kind: 'shape',
      path: roundedRectPath(x + half, y + half, width - top.width, height - top.width, insetRadii(radii, half)),
      stroke: { color: top.color, width: top.width, ...(top.dashed ? { dash: [top.width * 3, top.width * 2] } : {}) },
    });
    return;
  }
  // Per-side strokes following the box's rounded corners: each side owns the
  // corner arcs next to it when the neighbouring side has no border.
  const kappa = 0.5522847498;
  const stroke = (entry: { width: number; color: RgbaColor; dashed: boolean }, path: PathCommand[]) =>
    target.push({
      kind: 'shape',
      path,
      stroke: { color: entry.color, width: entry.width, cap: 'butt', ...(entry.dashed ? { dash: [entry.width * 3, entry.width * 2] } : {}) },
    });
  if (top) {
    const h = top.width / 2;
    const yy = y + h;
    const [tlx, tly] = left ? [Math.max(0, radii.tl[0] - h), Math.max(0, radii.tl[1] - h)] : [0, 0];
    const [trx, try_] = right ? [Math.max(0, radii.tr[0] - h), Math.max(0, radii.tr[1] - h)] : [0, 0];
    const path: PathCommand[] = [];
    const startX = x + (left ? left.width / 2 : 0);
    const endX = x + width - (right ? right.width / 2 : 0);
    if (tlx && tly) {
      path.push(['M', startX, yy + tly]);
      path.push(['C', startX, yy + tly - tly * kappa, startX + tlx - tlx * kappa, yy, startX + tlx, yy]);
    } else {
      path.push(['M', left ? startX : x, yy]);
    }
    path.push(['L', endX - trx, yy]);
    if (trx && try_) path.push(['C', endX - trx + trx * kappa, yy, endX, yy + try_ - try_ * kappa, endX, yy + try_]);
    else if (!right) path.push(['L', x + width, yy]);
    stroke(top, path);
  }
  if (bottom) {
    const h = bottom.width / 2;
    const yy = y + height - h;
    const [blx, bly] = left ? [Math.max(0, radii.bl[0] - h), Math.max(0, radii.bl[1] - h)] : [0, 0];
    const [brx, bry] = right ? [Math.max(0, radii.br[0] - h), Math.max(0, radii.br[1] - h)] : [0, 0];
    const startX = x + (left ? left.width / 2 : 0);
    const endX = x + width - (right ? right.width / 2 : 0);
    const path: PathCommand[] = [];
    if (blx && bly) {
      path.push(['M', startX, yy - bly]);
      path.push(['C', startX, yy - bly + bly * kappa, startX + blx - blx * kappa, yy, startX + blx, yy]);
    } else {
      path.push(['M', left ? startX : x, yy]);
    }
    path.push(['L', endX - brx, yy]);
    if (brx && bry) path.push(['C', endX - brx + brx * kappa, yy, endX, yy - bry + bry * kappa, endX, yy - bry]);
    else if (!right) path.push(['L', x + width, yy]);
    stroke(bottom, path);
  }
  const vertical = (entry: { width: number; color: RgbaColor; dashed: boolean }, xx: number, topRadius: number, bottomRadius: number) => {
    const startY = y + (top ? top.width / 2 + topRadius : 0);
    const endY = y + height - (bottom ? bottom.width / 2 + bottomRadius : 0);
    if (endY > startY) stroke(entry, [['M', xx, startY], ['L', xx, endY]]);
  };
  if (left) {
    const h = left.width / 2;
    vertical(left, x + h, top ? Math.max(0, radii.tl[1] - h) : 0, bottom ? Math.max(0, radii.bl[1] - h) : 0);
  }
  if (right) {
    const h = right.width / 2;
    vertical(right, x + width - h, top ? Math.max(0, radii.tr[1] - h) : 0, bottom ? Math.max(0, radii.br[1] - h) : 0);
  }
}

function sameColor(a?: RgbaColor, b?: RgbaColor): boolean {
  return Boolean(a && b && a.r === b.r && a.g === b.g && a.b === b.b && Math.abs(a.a - b.a) < 0.01);
}

/** Absolutely positioned ::before/::after boxes (tree connectors) relative to the element's padding box. */
function capturePseudo(element: Element, pseudo: '::before' | '::after', box: DOMRect, context: CaptureContext): void {
  const style = getComputedStyle(element, pseudo);
  if (!style.content || style.content === 'none' || style.content === 'normal' || style.display === 'none') return;
  if (style.position !== 'absolute' || style.visibility === 'hidden') return;
  const host = getComputedStyle(element);
  const paddingLeft = box.left - context.originX + (Number.parseFloat(host.borderLeftWidth) || 0);
  const paddingTop = box.top - context.originY + (Number.parseFloat(host.borderTopWidth) || 0);
  const innerWidth = box.width - (Number.parseFloat(host.borderLeftWidth) || 0) - (Number.parseFloat(host.borderRightWidth) || 0);
  const innerHeight = box.height - (Number.parseFloat(host.borderTopWidth) || 0) - (Number.parseFloat(host.borderBottomWidth) || 0);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  const resolve = (value: string, reference: number) => (value === 'auto' ? Number.NaN : evalLength(value, reference));
  let left = resolve(style.left, innerWidth);
  if (Number.isNaN(left)) {
    const right = resolve(style.right, innerWidth);
    left = Number.isNaN(right) ? 0 : innerWidth - right - width;
  }
  let top = resolve(style.top, innerHeight);
  if (Number.isNaN(top)) {
    const bottom = resolve(style.bottom, innerHeight);
    top = Number.isNaN(bottom) ? 0 : innerHeight - bottom - height;
  }
  // Used sizes exclude borders under content-box sizing.
  const borderBox =
    style.boxSizing === 'border-box'
      ? { width, height }
      : {
          width: width + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0),
          height: height + (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0),
        };
  paintBox(style, { x: paddingLeft + left, y: paddingTop + top, ...borderBox }, context, context.out);
}

function textTransform(text: string, style: CSSStyleDeclaration, locale: string): string {
  switch (style.textTransform) {
    case 'uppercase':
      return text.toLocaleUpperCase(locale);
    case 'lowercase':
      return text.toLocaleLowerCase(locale);
    case 'capitalize':
      return text.replace(/(^|\s)(\S)/g, (_, space: string, char: string) => space + char.toLocaleUpperCase(locale));
    default:
      return text;
  }
}

/** Splits a text node into its laid-out lines using per-character range boxes. */
function captureText(node: Text, style: CSSStyleDeclaration, context: CaptureContext, locale: string): void {
  const raw = node.data;
  if (!raw.trim()) return;
  const color = resolveCssColor(style.color);
  if (!visible(color)) return;
  const fontSize = Number.parseFloat(style.fontSize) || 14;
  const range = document.createRange();
  interface Line {
    start: number;
    end: number;
    left: number;
    right: number;
    top: number;
  }
  const lines: Line[] = [];
  const pattern = /[\s\S]/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const start = match.index;
    const end = start + match[0].length;
    range.setStart(node, start);
    range.setEnd(node, end);
    const rect = range.getBoundingClientRect();
    const isSpace = /\s/.test(match[0]);
    if (!rect.width && !rect.height) continue;
    const current = lines[lines.length - 1];
    if (current && Math.abs(rect.top - current.top) < fontSize * 0.5 && rect.left >= current.left - 1) {
      current.end = end;
      if (!isSpace) current.right = Math.max(current.right, rect.right);
      continue;
    }
    lines.push({
      start,
      end,
      left: isSpace ? rect.right : rect.left,
      right: isSpace ? rect.right : rect.right,
      top: rect.top,
    });
  }
  const ascent = fontAscent(style, fontSize);
  const align = style.textAlign;
  const family = primaryFamilyName(style.fontFamily);
  const weight = Number.parseInt(style.fontWeight, 10) || 400;
  lines.forEach((line) => {
    const text = textTransform(raw.slice(line.start, line.end), style, locale).replace(/\s+$/u, '').replace(/^\s+/u, '');
    if (!text) return;
    const left = line.left - context.originX;
    const right = line.right - context.originX;
    const anchor: SceneText['anchor'] =
      align === 'center' ? 'middle' : align === 'right' || align === 'end' ? 'end' : 'start';
    context.out.push({
      kind: 'text',
      text,
      x: anchor === 'middle' ? (left + right) / 2 : anchor === 'end' ? right : left,
      y: line.top - context.originY + ascent,
      anchor,
      width: right - left,
      font: { family, weight, italic: style.fontStyle === 'italic' || style.fontStyle === 'oblique', size: fontSize },
      color: withOpacity(color, context.opacity),
    });
  });
  range.detach();
}

function svgMatrix(element: SVGGraphicsElement, context: CaptureContext): Matrix | null {
  const ctm = element.getScreenCTM();
  if (!ctm) return null;
  return [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - context.originX, ctm.f - context.originY];
}

function numberAttribute(element: Element, name: string): number {
  return Number.parseFloat(element.getAttribute(name) ?? '0') || 0;
}

function captureSvg(svg: SVGSVGElement, context: CaptureContext, locale: string): void {
  const visit = (element: Element, opacity: number) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const nextOpacity = opacity * (Number.parseFloat(style.opacity) || (style.opacity === '0' ? 0 : 1));
    if (nextOpacity <= 0) return;
    const tag = element.tagName.toLowerCase();
    if (tag === 'g' || tag === 'svg') {
      Array.from(element.children).forEach((child) => visit(child, nextOpacity));
      return;
    }
    const graphics = element as SVGGraphicsElement;
    const matrix = svgMatrix(graphics, context);
    if (!matrix) return;
    if (tag === 'text') {
      const text = textTransform(element.textContent ?? '', style, locale).trim();
      const color = paintColor(style.fill, style);
      if (!text || !visible(color)) return;
      const rect = element.getBoundingClientRect();
      const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;
      const fontSize = (Number.parseFloat(style.fontSize) || 10) * scale;
      const ascent = fontAscent(style, Number.parseFloat(style.fontSize) || 10) * scale;
      const anchor = style.textAnchor === 'middle' ? 'middle' : style.textAnchor === 'end' ? 'end' : 'start';
      const left = rect.left - context.originX;
      const right = rect.right - context.originX;
      context.out.push({
        kind: 'text',
        text,
        x: anchor === 'middle' ? (left + right) / 2 : anchor === 'end' ? right : left,
        y: rect.top - context.originY + ascent,
        anchor,
        width: right - left,
        font: {
          family: primaryFamilyName(style.fontFamily),
          weight: Number.parseInt(style.fontWeight, 10) || 400,
          italic: style.fontStyle === 'italic',
          size: fontSize,
        },
        color: withOpacity(color, nextOpacity * context.opacity),
      });
      return;
    }
    let path: PathCommand[];
    if (tag === 'path') path = parseSvgPath(element.getAttribute('d') ?? '');
    else if (tag === 'ellipse') path = ellipsePath(numberAttribute(element, 'cx'), numberAttribute(element, 'cy'), numberAttribute(element, 'rx'), numberAttribute(element, 'ry'));
    else if (tag === 'circle') {
      const r = numberAttribute(element, 'r');
      path = ellipsePath(numberAttribute(element, 'cx'), numberAttribute(element, 'cy'), r, r);
    } else if (tag === 'line') {
      path = [
        ['M', numberAttribute(element, 'x1'), numberAttribute(element, 'y1')],
        ['L', numberAttribute(element, 'x2'), numberAttribute(element, 'y2')],
      ];
    } else if (tag === 'rect') {
      path = roundedRectPath(numberAttribute(element, 'x'), numberAttribute(element, 'y'), numberAttribute(element, 'width'), numberAttribute(element, 'height'));
    } else if (tag === 'polygon' || tag === 'polyline') {
      const values = (element.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number.parseFloat);
      const points: Array<[number, number]> = [];
      for (let index = 0; index + 1 < values.length; index += 2) points.push([values[index], values[index + 1]]);
      path = polygonPath(points);
      if (tag === 'polyline') path = path.filter((command) => command[0] !== 'Z');
    } else {
      return;
    }
    if (!path.length) return;
    const transformed = transformPath(path, matrix);
    if (!isFinitePath(transformed)) return;
    const fillColor = style.fill === 'none' ? null : paintColor(style.fill, style);
    const fillOpacity = Number.parseFloat(style.fillOpacity || '1');
    const strokeColor = style.stroke === 'none' ? null : paintColor(style.stroke, style);
    const strokeOpacity = Number.parseFloat(style.strokeOpacity || '1');
    const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;
    const rawStrokeWidth = Number.parseFloat(style.strokeWidth) || 1;
    const strokeWidth = style.vectorEffect === 'non-scaling-stroke' ? rawStrokeWidth : rawStrokeWidth * scale;
    const alpha = nextOpacity * context.opacity;
    const filterShadow = style.filter && style.filter !== 'none' ? parseDropShadowFilter(style.filter) : null;
    context.out.push({
      kind: 'shape',
      path: transformed,
      ...(visible(fillColor) && tag !== 'line' ? { fill: withOpacity(fillColor, alpha * fillOpacity) } : {}),
      ...(visible(strokeColor)
        ? {
            stroke: {
              color: withOpacity(strokeColor, alpha * strokeOpacity),
              width: strokeWidth,
              cap: style.strokeLinecap === 'round' ? 'round' : style.strokeLinecap === 'square' ? 'square' : 'butt',
              join: style.strokeLinejoin === 'round' ? 'round' : style.strokeLinejoin === 'bevel' ? 'bevel' : 'miter',
            },
          }
        : {}),
      ...(filterShadow ? { shadow: filterShadow } : {}),
    });
  };
  Array.from(svg.children).forEach((child) => visit(child, 1));
}

function captureElement(element: Element, context: CaptureContext, locale: string): void {
  const style = getComputedStyle(element);
  if (style.display === 'none') return;
  const opacity = context.opacity * (style.opacity === '' ? 1 : Number.parseFloat(style.opacity));
  if (opacity <= 0.001) return;
  const zIndex = Number.parseInt(style.zIndex, 10);
  const raised = style.position !== 'static' && Number.isFinite(zIndex) && zIndex > 0;
  const own: CaptureContext = {
    ...context,
    opacity,
    out: raised ? [] : context.out,
  };
  if (style.filter && style.filter !== 'none') {
    own.shadow = parseDropShadowFilter(style.filter) ?? context.shadow;
  }

  if (element instanceof SVGSVGElement) {
    captureSvg(element, own, locale);
  } else {
    const rect = element.getBoundingClientRect();
    const box = { x: rect.left - context.originX, y: rect.top - context.originY, width: rect.width, height: rect.height };
    const transformed = isRotatedOrFlipped(style);
    if (style.visibility !== 'hidden' && !transformed) paintBox(style, box, own, own.out);
    if (!transformed) capturePseudo(element, '::before', rect, own);

    // overflow: hidden clips children to the (rounded) padding box, e.g. card headers.
    const clips = style.overflowX !== 'visible' || style.overflowY !== 'visible';
    const childOut: SceneItem[] = clips ? [] : own.out;
    const childContext: CaptureContext = { ...own, out: childOut };
    element.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (style.visibility !== 'hidden') captureText(child as Text, style, childContext, locale);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        captureElement(child as Element, childContext, locale);
      }
    });
    if (clips && childOut.length) {
      const radii = cornerRadii(style, box.width, box.height);
      own.out.push({
        kind: 'group',
        clip: hasRadius(radii) ? roundedRectPath(box.x, box.y, box.width, box.height, radii) : roundedRectPath(box.x, box.y, box.width, box.height),
        items: childOut,
      });
    }
    if (!transformed) capturePseudo(element, '::after', rect, own);
  }

  if (raised) context.raised.push(...own.out);
}

interface MountedGraphic {
  host: HTMLElement;
  canvas: HTMLElement;
  unmount: () => void;
}

async function mountGraphic(model: SmartGraphicModel, width: number, locale: Locale): Promise<MountedGraphic> {
  const [{ createRoot }, { flushSync }, { SmartGraphicCanvas }, { LocaleContext }] = await Promise.all([
    import('react-dom/client'),
    import('react-dom'),
    import('@/components/Editor/SmartGraphicCanvas'),
    import('@/hooks/useLocale'),
  ]);
  const host = document.createElement('div');
  // Pins the light document palette even when the app runs in dark mode.
  host.className = 'lwrite-print-theme';
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('inert', '');
  host.setAttribute('data-export-capture', '');
  host.style.cssText = `position:fixed;left:-${width * 4}px;top:0;width:${width}px;pointer-events:none;contain:layout style;direction:ltr;font-variant-ligatures:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  const unmount = () => {
    root.unmount();
    host.remove();
  };
  try {
    flushSync(() => {
      root.render(
        createElement(
          LocaleContext.Provider,
          { value: { locale, setLocale: () => undefined, t: (key) => t(locale, key) } },
          createElement(SmartGraphicCanvas, { graphic: model }),
        ),
      );
    });
  } catch (error) {
    // A failed render must not leave the offscreen host in the editor's page.
    unmount();
    throw error;
  }
  const canvas = host.querySelector<HTMLElement>('.lwrite-graphic-canvas');
  if (!canvas) {
    unmount();
    throw new Error('Smart Graphic did not render');
  }
  return { host, canvas, unmount };
}

const FRAME_TIMEOUT_MS = 100;

/** Waits until every font used inside the element is loaded, so line breaks are final. */
async function settleFonts(element: HTMLElement): Promise<void> {
  if (!document.fonts) return;
  const fonts = new Set<string>();
  element.querySelectorAll('*').forEach((node) => {
    const style = getComputedStyle(node);
    if (node.textContent?.trim()) fonts.add(`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`);
  });
  await Promise.all(Array.from(fonts).map((font) => document.fonts.load(font).catch(() => [])));
  await document.fonts.ready;
  // One frame for layout; background tabs pause animation frames, so do not wait for long.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
    setTimeout(resolve, FRAME_TIMEOUT_MS);
  });
}

/** Renders `model` with the editor's renderer at `width` CSS px and returns its drawing. */
export async function captureGraphicScene(model: SmartGraphicModel, width: number, locale: Locale): Promise<GraphicScene | null> {
  if (!canCaptureGraphics()) return null;
  const mounted = await mountGraphic(model, width, locale);
  try {
    await settleFonts(mounted.canvas);
    const rect = mounted.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const context: CaptureContext = { originX: rect.left, originY: rect.top, opacity: 1, out: [], raised: [] };
    captureElement(mounted.canvas, context, locale);
    const items = [...context.out, ...context.raised];
    if (!items.length) return null;
    return { width: rect.width, height: rect.height, items };
  } finally {
    mounted.unmount();
  }
}

