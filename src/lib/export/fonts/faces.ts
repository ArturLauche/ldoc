/**
 * Reads the generated `public/fonts/<family>.css` files and reproduces the
 * browser's face selection, so exports use the same files and weights the
 * editor renders with.
 */

export type UnicodeRange = [number, number];

export interface FontFaceSegment {
  url: string;
  ranges: UnicodeRange[];
}

export interface FontFaceDefinition {
  family: string;
  weightMin: number;
  weightMax: number;
  style: 'normal' | 'italic';
  /** In declaration order; later segments win where ranges overlap. */
  segments: FontFaceSegment[];
}

export interface FaceMatch {
  face: FontFaceDefinition;
  /** Weight applied to a variable font (clamped to the face's range). */
  renderWeight: number;
  /** The browser emboldens text it asks for at 600+ from a lighter face. */
  syntheticBold: boolean;
}

const FULL_RANGE: UnicodeRange[] = [[0, 0x10ffff]];

export function parseUnicodeRanges(value: string): UnicodeRange[] {
  const ranges: UnicodeRange[] = [];
  value.split(',').forEach((part) => {
    const token = part.trim().toUpperCase().replace(/^U\+/, '');
    if (!token) return;
    if (token.includes('?')) {
      const low = Number.parseInt(token.replace(/\?/g, '0'), 16);
      const high = Number.parseInt(token.replace(/\?/g, 'F'), 16);
      if (Number.isFinite(low) && Number.isFinite(high)) ranges.push([low, high]);
      return;
    }
    const [start, end] = token.split('-');
    const low = Number.parseInt(start, 16);
    const high = end ? Number.parseInt(end, 16) : low;
    if (Number.isFinite(low) && Number.isFinite(high)) ranges.push([low, high]);
  });
  return ranges.length ? ranges : FULL_RANGE;
}

export function rangesContain(ranges: UnicodeRange[], codePoint: number): boolean {
  return ranges.some(([low, high]) => codePoint >= low && codePoint <= high);
}

function declaration(block: string, property: string): string | undefined {
  const match = block.match(new RegExp(`${property}\\s*:\\s*([^;]+);?`, 'i'));
  return match?.[1]?.trim();
}

/**
 * Parses `@font-face` rules. Only same-origin URLs below `/fonts/` or the
 * build's asset directory are accepted: exports never fetch third-party fonts.
 */
export function parseFontFaceCss(css: string): FontFaceDefinition[] {
  const faces: FontFaceDefinition[] = [];
  const pattern = /@font-face\s*{([^}]*)}/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) {
    const block = match[1];
    const family = declaration(block, 'font-family')?.replace(/^['"]|['"]$/g, '');
    const src = declaration(block, 'src')?.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1];
    if (!family || !src || !isAllowedFontUrl(src)) continue;
    const weights = (declaration(block, 'font-weight') ?? '400')
      .split(/\s+/)
      .map((value) => (value === 'normal' ? 400 : value === 'bold' ? 700 : Number.parseInt(value, 10)))
      .filter((value) => Number.isFinite(value));
    const weightMin = Math.min(...(weights.length ? weights : [400]));
    const weightMax = Math.max(...(weights.length ? weights : [400]));
    const style = /italic|oblique/i.test(declaration(block, 'font-style') ?? '') ? 'italic' : 'normal';
    const ranges = parseUnicodeRanges(declaration(block, 'unicode-range') ?? '');
    let face = faces.find(
      (candidate) =>
        candidate.family === family &&
        candidate.weightMin === weightMin &&
        candidate.weightMax === weightMax &&
        candidate.style === style,
    );
    if (!face) {
      face = { family, weightMin, weightMax, style, segments: [] };
      faces.push(face);
    }
    face.segments.push({ url: src, ranges });
  }
  return faces;
}

export function isAllowedFontUrl(url: string): boolean {
  return /^\/(?:fonts|assets|src\/assets)\/[\w./-]+\.(?:woff2|ttf|otf)$/i.test(url) && !url.includes('..');
}

/** CSS Fonts 4 §5.2 font-weight matching, restricted to the faces of one style. */
export function matchFontFace(faces: FontFaceDefinition[], desired: number, style: 'normal' | 'italic' = 'normal'): FaceMatch | null {
  const candidates = faces.filter((face) => face.style === style);
  const pool = candidates.length ? candidates : faces;
  if (!pool.length) return null;
  const within = pool.find((face) => desired >= face.weightMin && desired <= face.weightMax);
  const pick = (face: FontFaceDefinition): FaceMatch => {
    const renderWeight = Math.max(face.weightMin, Math.min(face.weightMax, desired));
    return { face, renderWeight, syntheticBold: desired >= 600 && renderWeight < 600 };
  };
  if (within) return pick(within);
  const heavier = pool.filter((face) => face.weightMin > desired).sort((a, b) => a.weightMin - b.weightMin);
  const lighter = pool.filter((face) => face.weightMax < desired).sort((a, b) => b.weightMax - a.weightMax);
  if (desired >= 400 && desired <= 500) {
    const upTo500 = heavier.filter((face) => face.weightMin <= 500);
    const beyond = heavier.filter((face) => face.weightMin > 500);
    return pick(upTo500[0] ?? lighter[0] ?? beyond[0]);
  }
  if (desired < 400) return pick(lighter[0] ?? heavier[0]);
  return pick(heavier[0] ?? lighter[0]);
}
