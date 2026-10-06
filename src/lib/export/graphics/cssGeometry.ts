import { resolveCssColor, type RgbaColor } from '../color';
import { polygonPath, roundedRectPath, type CornerRadii, type PathCommand, type SceneLinearGradient, type SceneShadow } from './scene';

/**
 * Parsers for the computed CSS values the Smart Graphic renderers use
 * (clip-path polygons with calc(), radii, shadows, gradients, SVG paths).
 * They work on the browser's computed serialization, not on author CSS.
 */

/** Splits on commas (or whitespace) that are not inside parentheses. */
export function splitTopLevel(value: string, separator: ',' | ' '): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    const isSeparator = separator === ',' ? char === ',' : /\s/.test(char);
    if (isSeparator && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Evaluates a CSS length-percentage (`12px`, `50%`, `calc(100% - 14px)`) against a reference size. */
export function evalLength(value: string, reference: number): number {
  const tokens = value
    .replace(/calc\(/g, '(')
    .match(/-?\d*\.?\d+(?:e[+-]?\d+)?(?:px|%)?|[()+\-*/]/gi);
  if (!tokens) return 0;
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];
  const primary = (): number => {
    const token = next();
    if (token === '(') {
      const result = sum();
      next();
      return result;
    }
    if (token === '-') return -primary();
    if (!token) return 0;
    const numeric = Number.parseFloat(token);
    if (token.endsWith('%')) return (numeric / 100) * reference;
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const product = (): number => {
    let result = primary();
    while (peek() === '*' || peek() === '/') {
      const operator = next();
      const right = primary();
      result = operator === '*' ? result * right : right ? result / right : result;
    }
    return result;
  };
  const sum = (): number => {
    let result = product();
    while (peek() === '+' || peek() === '-') {
      const operator = next();
      const right = product();
      result = operator === '+' ? result + right : result - right;
    }
    return result;
  };
  return sum();
}

/** Computed corner radii (`8px`, `8px 4px`, `50%`) for a box. */
export function cornerRadii(style: CSSStyleDeclaration, width: number, height: number): CornerRadii {
  const corner = (value: string): [number, number] => {
    const [horizontal, vertical = horizontal] = splitTopLevel(value || '0px', ' ');
    return [Math.max(0, evalLength(horizontal, width)), Math.max(0, evalLength(vertical, height))];
  };
  return {
    tl: corner(style.borderTopLeftRadius),
    tr: corner(style.borderTopRightRadius),
    br: corner(style.borderBottomRightRadius),
    bl: corner(style.borderBottomLeftRadius),
  };
}

export function hasRadius(radii: CornerRadii): boolean {
  return [radii.tl, radii.tr, radii.br, radii.bl].some(([x, y]) => x > 0 && y > 0);
}

/** Shrinks radii for a box inset by `amount` (like CSS inner border radius). */
export function insetRadii(radii: CornerRadii, amount: number): CornerRadii {
  const shrink = ([x, y]: [number, number]): [number, number] => [Math.max(0, x - amount), Math.max(0, y - amount)];
  return { tl: shrink(radii.tl), tr: shrink(radii.tr), br: shrink(radii.br), bl: shrink(radii.bl) };
}

export function expandRadii(radii: CornerRadii, amount: number): CornerRadii {
  const grow = ([x, y]: [number, number]): [number, number] => (x > 0 || y > 0 ? [x + amount, y + amount] : [0, 0]);
  return { tl: grow(radii.tl), tr: grow(radii.tr), br: grow(radii.br), bl: grow(radii.bl) };
}

/** `clip-path: polygon(...)` or `inset(...)` as a path in the box's coordinates (offset by x, y). */
export function clipPathShape(value: string, x: number, y: number, width: number, height: number): PathCommand[] | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'none') return null;
  const polygon = trimmed.match(/^polygon\((.*)\)$/s);
  if (polygon) {
    let body = polygon[1].trim();
    // An optional fill rule comes first.
    body = body.replace(/^(nonzero|evenodd)\s*,/, '');
    const points = splitTopLevel(body, ',').map((point): [number, number] => {
      const [px = '0', py = '0'] = splitTopLevel(point, ' ');
      return [x + evalLength(px, width), y + evalLength(py, height)];
    });
    return points.length >= 3 ? polygonPath(points) : null;
  }
  const inset = trimmed.match(/^inset\((.*)\)$/s);
  if (inset) {
    const [offsets, round] = inset[1].split(/\bround\b/);
    const values = splitTopLevel(offsets.trim(), ' ');
    const [top = '0px', right = top, bottom = top, left = right] = values;
    const t = evalLength(top, height);
    const r = evalLength(right, width);
    const b = evalLength(bottom, height);
    const l = evalLength(left, width);
    let radii: CornerRadii | undefined;
    if (round) {
      const [tl = '0px', tr = tl, br = tl, bl = tr] = splitTopLevel(round.trim(), ' ');
      const radius = (token: string): [number, number] => {
        const value = evalLength(token, width);
        return [value, value];
      };
      radii = { tl: radius(tl), tr: radius(tr), br: radius(br), bl: radius(bl) };
    }
    return roundedRectPath(x + l, y + t, width - l - r, height - t - b, radii);
  }
  return null;
}

export interface ParsedBoxShadow extends SceneShadow {
  inset: boolean;
}

/** Computed `box-shadow` list (`rgb(…) 0px 0px 0px 2px inset, …`). */
export function parseBoxShadows(value: string): ParsedBoxShadow[] {
  if (!value || value === 'none') return [];
  return splitTopLevel(value, ',').flatMap((shadow) => {
    const tokens = splitTopLevel(shadow, ' ');
    let color: RgbaColor | null = null;
    const lengths: number[] = [];
    let inset = false;
    tokens.forEach((token) => {
      if (token === 'inset') inset = true;
      else if (/^-?\d/.test(token)) lengths.push(Number.parseFloat(token));
      else color = resolveCssColor(token) ?? color;
    });
    const resolved = color as RgbaColor | null;
    if (!resolved || resolved.a === 0 || lengths.length < 2) return [];
    const [dx, dy, blur = 0, spread = 0] = lengths;
    return [{ inset, dx, dy, blur, spread, color: resolved }];
  });
}

/** The first `drop-shadow()` of a computed `filter`, as a shadow (color and lengths in any order). */
export function parseDropShadowFilter(value: string): SceneShadow | null {
  const filter = splitTopLevel(value, ' ').find((part) => part.startsWith('drop-shadow(') && part.endsWith(')'));
  if (!filter) return null;
  let color: RgbaColor | null = null;
  const lengths: number[] = [];
  splitTopLevel(filter.slice('drop-shadow('.length, -1), ' ').forEach((token) => {
    if (/^-?[\d.]/.test(token)) lengths.push(Number.parseFloat(token));
    else color = resolveCssColor(token) ?? color;
  });
  const resolved = color as RgbaColor | null;
  if (!resolved || lengths.length < 2 || !lengths.every(Number.isFinite)) return null;
  const [dx, dy, blur = 0] = lengths;
  return { color: resolved, dx, dy, blur, spread: 0 };
}

/** First `linear-gradient(...)` of a computed background-image, positioned on a box. */
export function parseLinearGradient(value: string, x: number, y: number, width: number, height: number): SceneLinearGradient | null {
  const match = value.match(/linear-gradient\((.*)\)/s);
  if (!match) return null;
  const parts = splitTopLevel(match[1], ',');
  let angle = 180;
  if (/^-?[\d.]+(deg|turn|rad)$/.test(parts[0]) || parts[0].startsWith('to ')) {
    const head = parts.shift() as string;
    if (head.endsWith('deg')) angle = Number.parseFloat(head);
    else if (head.endsWith('turn')) angle = Number.parseFloat(head) * 360;
    else if (head.endsWith('rad')) angle = (Number.parseFloat(head) * 180) / Math.PI;
    else angle = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[head] ?? 180;
  }
  const stops = parts
    .map((part) => {
      const tokens = splitTopLevel(part, ' ');
      const position = tokens.find((token) => token.endsWith('%'));
      const colorToken = tokens.filter((token) => token !== position).join(' ');
      const color = resolveCssColor(colorToken);
      return color ? { color, offset: position ? Number.parseFloat(position) / 100 : Number.NaN } : null;
    })
    .filter((stop): stop is { color: RgbaColor; offset: number } => stop !== null);
  if (stops.length < 2) return null;
  stops.forEach((stop, index) => {
    if (Number.isNaN(stop.offset)) stop.offset = index === 0 ? 0 : index === stops.length - 1 ? 1 : index / (stops.length - 1);
  });
  // CSS gradient line: through the center, long enough that corners reach 0%/100%.
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const length = Math.abs(width * dx) + Math.abs(height * dy);
  const cx = x + width / 2;
  const cy = y + height / 2;
  return {
    kind: 'linear',
    x1: cx - (dx * length) / 2,
    y1: cy - (dy * length) / 2,
    x2: cx + (dx * length) / 2,
    y2: cy + (dy * length) / 2,
    stops,
  };
}

/** Parses SVG path data into absolute M/L/C/Z commands (arcs and quadratics become cubics). */
export function parseSvgPath(data: string): PathCommand[] {
  const tokens = data.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g) ?? [];
  const commands: PathCommand[] = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastControl: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;
  const number = () => Number.parseFloat(tokens[index++] ?? '0');
  const quadToCubic = (x0: number, y0: number, qx: number, qy: number, x1: number, y1: number): PathCommand => [
    'C',
    x0 + (2 / 3) * (qx - x0),
    y0 + (2 / 3) * (qy - y0),
    x1 + (2 / 3) * (qx - x1),
    y1 + (2 / 3) * (qy - y1),
    x1,
    y1,
  ];
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (command.toUpperCase()) {
      case 'M': {
        x = ox + number();
        y = oy + number();
        startX = x;
        startY = y;
        commands.push(['M', x, y]);
        command = relative ? 'l' : 'L';
        lastControl = lastQuad = null;
        break;
      }
      case 'L':
        x = ox + number();
        y = oy + number();
        commands.push(['L', x, y]);
        lastControl = lastQuad = null;
        break;
      case 'H':
        x = ox + number();
        commands.push(['L', x, y]);
        lastControl = lastQuad = null;
        break;
      case 'V':
        y = oy + number();
        commands.push(['L', x, y]);
        lastControl = lastQuad = null;
        break;
      case 'C': {
        const c1x = ox + number();
        const c1y = oy + number();
        const c2x = ox + number();
        const c2y = oy + number();
        x = ox + number();
        y = oy + number();
        commands.push(['C', c1x, c1y, c2x, c2y, x, y]);
        lastControl = [c2x, c2y];
        lastQuad = null;
        break;
      }
      case 'S': {
        const c1x = lastControl ? 2 * x - lastControl[0] : x;
        const c1y = lastControl ? 2 * y - lastControl[1] : y;
        const c2x = ox + number();
        const c2y = oy + number();
        x = ox + number();
        y = oy + number();
        commands.push(['C', c1x, c1y, c2x, c2y, x, y]);
        lastControl = [c2x, c2y];
        lastQuad = null;
        break;
      }
      case 'Q': {
        const qx = ox + number();
        const qy = oy + number();
        const endX = ox + number();
        const endY = oy + number();
        commands.push(quadToCubic(x, y, qx, qy, endX, endY));
        x = endX;
        y = endY;
        lastQuad = [qx, qy];
        lastControl = null;
        break;
      }
      case 'T': {
        const qx: number = lastQuad ? 2 * x - lastQuad[0] : x;
        const qy: number = lastQuad ? 2 * y - lastQuad[1] : y;
        const endX = ox + number();
        const endY = oy + number();
        commands.push(quadToCubic(x, y, qx, qy, endX, endY));
        x = endX;
        y = endY;
        lastQuad = [qx, qy];
        lastControl = null;
        break;
      }
      case 'A': {
        const rx = number();
        const ry = number();
        const rotation = number();
        const large = number();
        const sweep = number();
        const endX = ox + number();
        const endY = oy + number();
        commands.push(...arcToCubics(x, y, rx, ry, rotation, large !== 0, sweep !== 0, endX, endY));
        x = endX;
        y = endY;
        lastControl = lastQuad = null;
        break;
      }
      case 'Z':
        commands.push(['Z']);
        x = startX;
        y = startY;
        lastControl = lastQuad = null;
        break;
      default:
        index += 1;
    }
  }
  return commands;
}

/** SVG elliptical arc to cubic Béziers (SVG 1.1 F.6 endpoint-to-center conversion). */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathCommand[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [['L', x2, y2]];
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (large === sweep) factor = -factor;
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.max(-1, Math.min(1, dot)));
  };
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (theta: number): [number, number] => [
    cx + rx * Math.cos(theta) * cos - ry * Math.sin(theta) * sin,
    cy + rx * Math.cos(theta) * sin + ry * Math.sin(theta) * cos,
  ];
  const derivative = (theta: number): [number, number] => [
    -rx * Math.sin(theta) * cos - ry * Math.cos(theta) * sin,
    -rx * Math.sin(theta) * sin + ry * Math.cos(theta) * cos,
  ];
  const result: PathCommand[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const a = theta1 + segment * step;
    const b = a + step;
    const [ax, ay] = point(a);
    const [bx, by] = point(b);
    const [dax, day] = derivative(a);
    const [dbx, dby] = derivative(b);
    result.push(['C', ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by]);
  }
  return result;
}
