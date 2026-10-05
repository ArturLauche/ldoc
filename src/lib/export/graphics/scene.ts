import type { RgbaColor } from '../color';

/**
 * A Smart Graphic as vector drawing instructions, captured from the editor's
 * own renderer. Coordinates are CSS px, origin at the top left, y down.
 * Exporters translate this one representation (PDF operators, SVG, raster)
 * instead of re-implementing each layout.
 */

export type PathCommand =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export interface SceneLinearGradient {
  kind: 'linear';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: Array<{ offset: number; color: RgbaColor }>;
}

export type ScenePaint = RgbaColor | SceneLinearGradient;

export interface SceneStroke {
  color: RgbaColor;
  width: number;
  dash?: number[];
  cap?: 'butt' | 'round' | 'square';
  join?: 'miter' | 'round' | 'bevel';
}

export interface SceneShadow {
  dx: number;
  dy: number;
  blur: number;
  spread: number;
  color: RgbaColor;
}

export interface SceneShape {
  kind: 'shape';
  path: PathCommand[];
  fill?: ScenePaint;
  stroke?: SceneStroke;
  /** Drop shadow of the painted shape (CSS `filter: drop-shadow`). */
  shadow?: SceneShadow;
  /** Gaussian blur radius: the shape is a soft box-shadow. Formats without blur skip it. */
  blur?: number;
}

export interface SceneFont {
  family: string;
  weight: number;
  italic: boolean;
  /** px */
  size: number;
}

export interface SceneText {
  kind: 'text';
  text: string;
  /** Anchor x; baseline y. */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  /** Width the browser laid the line out at (px). */
  width: number;
  font: SceneFont;
  color: RgbaColor;
}

export interface SceneGroup {
  kind: 'group';
  clip?: PathCommand[];
  opacity?: number;
  items: SceneItem[];
}

export type SceneItem = SceneShape | SceneText | SceneGroup;

export interface GraphicScene {
  width: number;
  height: number;
  items: SceneItem[];
}

export function isGradient(paint: ScenePaint): paint is SceneLinearGradient {
  return (paint as SceneLinearGradient).kind === 'linear';
}

export interface CornerRadii {
  tl: [number, number];
  tr: [number, number];
  br: [number, number];
  bl: [number, number];
}

// Cubic Bézier approximation of a quarter ellipse.
const KAPPA = 0.5522847498;

/** Rectangle path with elliptical corners, radii scaled down like CSS when they overlap. */
export function roundedRectPath(x: number, y: number, width: number, height: number, radii?: CornerRadii): PathCommand[] {
  if (width <= 0 || height <= 0) return [];
  const r = radii ?? { tl: [0, 0], tr: [0, 0], br: [0, 0], bl: [0, 0] };
  const scale = Math.min(
    1,
    width / Math.max(r.tl[0] + r.tr[0], 1e-9),
    width / Math.max(r.bl[0] + r.br[0], 1e-9),
    height / Math.max(r.tl[1] + r.bl[1], 1e-9),
    height / Math.max(r.tr[1] + r.br[1], 1e-9),
  );
  const [tlx, tly] = [r.tl[0] * scale, r.tl[1] * scale];
  const [trx, try_] = [r.tr[0] * scale, r.tr[1] * scale];
  const [brx, bry] = [r.br[0] * scale, r.br[1] * scale];
  const [blx, bly] = [r.bl[0] * scale, r.bl[1] * scale];
  const right = x + width;
  const bottom = y + height;
  const path: PathCommand[] = [['M', x + tlx, y], ['L', right - trx, y]];
  if (trx || try_) path.push(['C', right - trx + trx * KAPPA, y, right, y + try_ - try_ * KAPPA, right, y + try_]);
  path.push(['L', right, bottom - bry]);
  if (brx || bry) path.push(['C', right, bottom - bry + bry * KAPPA, right - brx + brx * KAPPA, bottom, right - brx, bottom]);
  path.push(['L', x + blx, bottom]);
  if (blx || bly) path.push(['C', x + blx - blx * KAPPA, bottom, x, bottom - bly + bly * KAPPA, x, bottom - bly]);
  path.push(['L', x, y + tly]);
  if (tlx || tly) path.push(['C', x, y + tly - tly * KAPPA, x + tlx - tlx * KAPPA, y, x + tlx, y]);
  path.push(['Z']);
  return path;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
    ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
    ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy],
    ['Z'],
  ];
}

export function polygonPath(points: Array<[number, number]>): PathCommand[] {
  if (points.length < 2) return [];
  return [['M', points[0][0], points[0][1]], ...points.slice(1).map(([x, y]): PathCommand => ['L', x, y]), ['Z']];
}

export function transformPath(path: PathCommand[], matrix: [number, number, number, number, number, number]): PathCommand[] {
  const [a, b, c, d, e, f] = matrix;
  const map = (x: number, y: number): [number, number] => [a * x + c * y + e, b * x + d * y + f];
  return path.map((command): PathCommand => {
    switch (command[0]) {
      case 'M':
        return ['M', ...map(command[1], command[2])];
      case 'L':
        return ['L', ...map(command[1], command[2])];
      case 'C':
        return ['C', ...map(command[1], command[2]), ...map(command[3], command[4]), ...map(command[5], command[6])];
      default:
        return command;
    }
  });
}
