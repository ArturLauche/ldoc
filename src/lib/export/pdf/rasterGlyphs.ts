import { cssGenericFamily } from '../fonts/catalog';
import type { RunStyle } from '../typography';
import type { GlyphRasterizer } from './inline';

/**
 * Last-resort rendering of characters no embeddable font covers (emoji, CJK,
 * Arabic…): the browser draws them with its system fonts into a small image,
 * so the PDF shows them instead of dropping them. Text in those images is not
 * selectable; exports report it.
 */
const SCALE = 4;

export interface CanvasGlyphRasterizer extends GlyphRasterizer {
  render(text: string, style: RunStyle): Promise<Uint8Array | null>;
}

function fontString(style: RunStyle): string {
  const stack = [`"${style.family.name}"`, cssGenericFamily(style.family), 'system-ui', '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Noto Color Emoji"', 'sans-serif'];
  return `${style.italic ? 'italic ' : ''}${style.weight} ${style.sizePx}px ${stack.join(', ')}`;
}

export function createCanvasGlyphRasterizer(): CanvasGlyphRasterizer | null {
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return null;
  let context: CanvasRenderingContext2D | null;
  try {
    context = document.createElement('canvas').getContext('2d');
  } catch {
    context = null;
  }
  if (!context) return null;
  const measureContext = context;
  const measure = (text: string, style: RunStyle) => {
    measureContext.font = fontString(style);
    const metrics = measureContext.measureText(text);
    if (!metrics.width) return null;
    return {
      width: metrics.width,
      ascent: metrics.fontBoundingBoxAscent || style.sizePx * 0.9,
      descent: metrics.fontBoundingBoxDescent || style.sizePx * 0.25,
    };
  };
  return {
    measure,
    async render(text, style) {
      const measured = measure(text, style);
      if (!measured) return null;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(measured.width * SCALE));
      canvas.height = Math.max(1, Math.ceil((measured.ascent + measured.descent) * SCALE));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(SCALE, SCALE);
      ctx.font = fontString(style);
      ctx.fillStyle = `#${style.color}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, 0, measured.ascent);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    },
  };
}
