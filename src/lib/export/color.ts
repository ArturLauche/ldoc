/** CSS color parsing shared by every exporter and the graphic capture. */

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  /** 0–1 */
  a: number;
}

const NAMED: Record<string, string> = {
  black: '000000',
  white: 'ffffff',
  red: 'ff0000',
  green: '008000',
  blue: '0000ff',
  yellow: 'ffff00',
  cyan: '00ffff',
  aqua: '00ffff',
  magenta: 'ff00ff',
  fuchsia: 'ff00ff',
  gray: '808080',
  grey: '808080',
  silver: 'c0c0c0',
  maroon: '800000',
  olive: '808000',
  lime: '00ff00',
  navy: '000080',
  purple: '800080',
  teal: '008080',
  orange: 'ffa500',
  pink: 'ffc0cb',
  brown: 'a52a2a',
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): RgbaColor | null {
  const value = hex.length === 3 || hex.length === 4 ? hex.split('').map((char) => char + char).join('') : hex;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return null;
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) / 255 : 1,
  };
}

function parseComponent(token: string, scale: number): number {
  return token.endsWith('%') ? (Number.parseFloat(token) / 100) * scale : Number.parseFloat(token);
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const value = token.endsWith('%') ? Number.parseFloat(token) / 100 : Number.parseFloat(token);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

function splitArguments(body: string): { parts: string[]; alpha?: string } {
  const [main, alpha] = body.split('/');
  const parts = main.replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (alpha !== undefined) return { parts, alpha: alpha.trim() };
  if (parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255];
}

/** Parses hex, rgb(), hsl(), color(srgb …) and basic names. Returns null for anything else. */
export function parseCssColor(value: string | undefined | null): RgbaColor | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'none' || trimmed === 'currentcolor' || trimmed === 'inherit') return null;
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (trimmed.startsWith('#')) return parseHex(trimmed.slice(1));
  if (NAMED[trimmed]) return parseHex(NAMED[trimmed]);
  const fn = trimmed.match(/^([a-z]+)\((.*)\)$/);
  if (!fn) return null;
  const [, name, body] = fn;
  if (name === 'rgb' || name === 'rgba') {
    const { parts, alpha } = splitArguments(body);
    if (parts.length < 3) return null;
    const [r, g, b] = parts.map((part) => parseComponent(part, 255));
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: parseAlpha(alpha) };
  }
  if (name === 'hsl' || name === 'hsla') {
    const { parts, alpha } = splitArguments(body);
    if (parts.length < 3) return null;
    const h = Number.parseFloat(parts[0]);
    const s = Number.parseFloat(parts[1]) / 100;
    const l = Number.parseFloat(parts[2]) / 100;
    if (![h, s, l].every(Number.isFinite)) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: parseAlpha(alpha) };
  }
  if (name === 'color') {
    const [main, alphaPart] = body.split('/');
    const parts = main.trim().split(/\s+/);
    const alpha = alphaPart?.trim();
    if (parts[0] !== 'srgb' || parts.length < 4) return null;
    const [r, g, b] = parts.slice(1, 4).map((part) => parseComponent(part, 1) * 255);
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r: clampByte(r), g: clampByte(g), b: clampByte(b), a: parseAlpha(alpha) };
  }
  return null;
}

let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Resolves any CSS color the browser understands (oklch, lab, system
 * colors…) by painting one pixel. Only used when `parseCssColor` cannot.
 */
export function resolveCssColor(value: string | undefined | null): RgbaColor | null {
  const parsed = parseCssColor(value);
  if (parsed || !value) return parsed;
  if (probe === undefined) {
    try {
      const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
      probe = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    } catch {
      probe = null;
    }
  }
  if (!probe) return null;
  try {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000000';
    probe.fillStyle = value;
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
}

/** Composites a translucent color over an opaque backdrop. */
export function flattenColor(color: RgbaColor, backdrop: RgbaColor = WHITE): RgbaColor {
  const a = color.a;
  return {
    r: clampByte(color.r * a + backdrop.r * (1 - a)),
    g: clampByte(color.g * a + backdrop.g * (1 - a)),
    b: clampByte(color.b * a + backdrop.b * (1 - a)),
    a: 1,
  };
}

export const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

/** Uppercase RRGGBB without '#', or null. Translucent colors are flattened onto white. */
export function toHex(value: string | RgbaColor | undefined | null): string | null {
  const color = typeof value === 'string' || value == null ? resolveCssColor(value) : value;
  if (!color || color.a === 0) return null;
  const solid = color.a < 1 ? flattenColor(color) : color;
  return [solid.r, solid.g, solid.b].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}
