import type { RgbaColor } from '../color';
import { escapeXml } from '../shared';
import { isGradient, type GraphicScene, type PathCommand, type SceneItem, type ScenePaint, type SceneShadow, type SceneText } from './scene';

/**
 * Serializes a captured graphic scene to SVG. HTML export keeps text as
 * `<text>` (selectable, uses the document's embedded fonts); office formats
 * pass an `outline` callback so glyphs become paths and the SVG/PNG renders
 * identically without the fonts installed.
 */

export interface SvgOptions {
  title?: string;
  description?: string;
  /** Returns SVG path data for a text item (in scene coordinates), or null to keep `<text>`. */
  outline?: (text: SceneText) => string | null;
  /** CSS font-family value for `<text>` elements. */
  fontStack?: (family: string) => string;
  /** Extra attributes on the root element. */
  attributes?: Record<string, string>;
  /** Draw drop shadows (filters). */
  shadows?: boolean;
  /** Prefix for gradient/clip/filter ids; must be unique per SVG inlined into one document. */
  idPrefix?: string;
}

let svgCounter = 0;

const round = (value: number) => Math.round(value * 100) / 100;

export function pathData(path: PathCommand[]): string {
  return path
    .map((command) => {
      switch (command[0]) {
        case 'M':
        case 'L':
          return `${command[0]}${round(command[1])} ${round(command[2])}`;
        case 'C':
          return `C${command.slice(1).map((value) => round(value as number)).join(' ')}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

function rgb(color: RgbaColor): string {
  return `rgb(${color.r},${color.g},${color.b})`;
}

function opacityAttribute(name: string, color: RgbaColor): string {
  return color.a < 0.999 ? ` ${name}="${round(color.a)}"` : '';
}

export function sceneToSvg(scene: GraphicScene, options: SvgOptions = {}): string {
  const defs: string[] = [];
  let nextId = 0;
  svgCounter += 1;
  const idPrefix = options.idPrefix ?? `lw${svgCounter.toString(36)}`;
  const id = (prefix: string) => `${idPrefix}-${prefix}${(nextId += 1)}`;
  const shadowFilters = new Map<string, string>();

  const paint = (value: ScenePaint, kind: 'fill' | 'stroke'): string => {
    if (!isGradient(value)) return ` ${kind}="${rgb(value)}"${opacityAttribute(`${kind}-opacity`, value)}`;
    const gradientId = id('g');
    const stops = value.stops
      .map((stop) => `<stop offset="${round(stop.offset)}" stop-color="${rgb(stop.color)}"${opacityAttribute('stop-opacity', stop.color)}/>`)
      .join('');
    defs.push(
      `<linearGradient id="${gradientId}" gradientUnits="userSpaceOnUse" x1="${round(value.x1)}" y1="${round(value.y1)}" x2="${round(value.x2)}" y2="${round(value.y2)}">${stops}</linearGradient>`,
    );
    return ` ${kind}="url(#${gradientId})"`;
  };

  const filterFor = (shadow: SceneShadow): string => {
    const key = `${shadow.dx}|${shadow.dy}|${shadow.blur}|${rgb(shadow.color)}|${shadow.color.a}`;
    let filterId = shadowFilters.get(key);
    if (!filterId) {
      filterId = id('s');
      shadowFilters.set(key, filterId);
      defs.push(
        `<filter id="${filterId}" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="${round(shadow.dx)}" dy="${round(shadow.dy)}" stdDeviation="${round(shadow.blur / 2)}" flood-color="${rgb(shadow.color)}" flood-opacity="${round(shadow.color.a)}"/></filter>`,
      );
    }
    return ` filter="url(#${filterId})"`;
  };

  const blurFilters = new Map<number, string>();
  const blurFilter = (radius: number): string => {
    let filterId = blurFilters.get(radius);
    if (!filterId) {
      filterId = id('b');
      blurFilters.set(radius, filterId);
      // CSS blur radius is twice the Gaussian standard deviation.
      defs.push(
        `<filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${round(radius / 2)}"/></filter>`,
      );
    }
    return ` filter="url(#${filterId})"`;
  };

  const text = (item: SceneText): string => {
    const outlined = options.outline?.(item);
    if (outlined !== null && outlined !== undefined) {
      return outlined ? `<path d="${outlined}" fill="${rgb(item.color)}"${opacityAttribute('fill-opacity', item.color)}/>` : '';
    }
    const family = options.fontStack ? options.fontStack(item.font.family) : `'${item.font.family}', sans-serif`;
    return `<text x="${round(item.x)}" y="${round(item.y)}" text-anchor="${item.anchor}" font-family="${escapeXml(family)}" font-size="${round(item.font.size)}" font-weight="${item.font.weight}"${item.font.italic ? ' font-style="italic"' : ''} fill="${rgb(item.color)}"${opacityAttribute('fill-opacity', item.color)} xml:space="preserve">${escapeXml(item.text)}</text>`;
  };

  const render = (items: SceneItem[]): string =>
    items
      .map((item) => {
        if (item.kind === 'text') return text(item);
        if (item.kind === 'group') {
          let attributes = '';
          if (item.clip) {
            const clipId = id('c');
            defs.push(`<clipPath id="${clipId}"><path d="${pathData(item.clip)}"/></clipPath>`);
            attributes += ` clip-path="url(#${clipId})"`;
          }
          if (item.opacity !== undefined && item.opacity < 1) attributes += ` opacity="${round(item.opacity)}"`;
          return `<g${attributes}>${render(item.items)}</g>`;
        }
        const d = pathData(item.path);
        if (!d) return '';
        let attributes = item.fill ? paint(item.fill, 'fill') : ' fill="none"';
        if (item.stroke) {
          attributes += paint(item.stroke.color, 'stroke');
          attributes += ` stroke-width="${round(item.stroke.width)}"`;
          if (item.stroke.cap && item.stroke.cap !== 'butt') attributes += ` stroke-linecap="${item.stroke.cap}"`;
          if (item.stroke.join && item.stroke.join !== 'miter') attributes += ` stroke-linejoin="${item.stroke.join}"`;
          if (item.stroke.dash?.length) attributes += ` stroke-dasharray="${item.stroke.dash.map(round).join(' ')}"`;
        }
        if (item.blur) {
          if (options.shadows === false) return '';
          attributes += blurFilter(item.blur);
        } else if (item.shadow && options.shadows !== false && item.fill) {
          attributes += filterFor(item.shadow);
        }
        return `<path d="${d}"${attributes}/>`;
      })
      .join('');

  const body = render(scene.items);
  const width = round(scene.width);
  const height = round(scene.height);
  const extra = Object.entries(options.attributes ?? {})
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  const description = options.description ? `<desc>${escapeXml(options.description)}</desc>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"${extra}>${title}${description}${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}
