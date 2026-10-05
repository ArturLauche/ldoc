import type { WarningCollector } from '../warnings';
import { BoundedCache, fetchSameOrigin, mapWithConcurrency } from '../resources';
import {
  DEFAULT_DOCUMENT_FAMILY,
  resolveFamily,
  slugForFamily,
  type ResolvedFamily,
  type StandardFamily,
} from './catalog';
import { matchFontFace, parseFontFaceCss, rangesContain, type FontFaceDefinition, type UnicodeRange } from './faces';
import { FALLBACK_FAMILY, fallbackFontUrl } from './fallback';
import { loadFontkit, type FontkitFont, type FontkitModule } from './fontkit';
import { woff2ToTrueType } from './sfnt';

/** A style as the editor renders it: family, CSS weight, italic. */
export interface FontStyleRequest {
  family: ResolvedFamily;
  weight: number;
  italic: boolean;
}

/** One loaded font file at one weight. */
export interface LoadedFont {
  key: string;
  family: string;
  renderWeight: number;
  /** fontkit font, TrueType, instanced at `renderWeight`. */
  font: FontkitFont;
  /** `unicode-range` of the source rule. */
  ranges: UnicodeRange[];
  /** Original file bytes as served (WOFF2 or TTF). */
  sourceBytes: Uint8Array;
  sourceUrl: string;
  /** True for the Noto Sans fallback, whose italic faces are real italics. */
  fallback: boolean;
  italic: boolean;
}

export interface FaceResolution {
  /** Family the document asked for. */
  requested: ResolvedFamily;
  /** Family drawn with: the request, or the document font when it cannot be loaded. */
  family: ResolvedFamily;
  cssWeight: number;
  renderWeight: number;
  syntheticBold: boolean;
  syntheticItalic: boolean;
  /** Font files in lookup order (last-declared `@font-face` first, as browsers do). */
  fonts: LoadedFont[];
  /** PDF base-14 family for system fonts. */
  standard?: StandardFamily;
}

interface FamilyUsage {
  family: ResolvedFamily;
  /** CSS weight → used code points. */
  weights: Map<number, Set<number>>;
  italic: boolean;
  /** Characters per CSS weight, to pick Office's regular/bold faces. */
  counts: Map<number, number>;
}

export interface RegistryLoadOptions {
  /** Convert to TrueType and instance variations (PDF layout, Office embedding, outlines). */
  instances: boolean;
  /** Load Noto Sans for characters the selected fonts do not cover. */
  fallback: boolean;
}

// Font assets are immutable; keep recently used ones across exports, bounded by bytes.
const stylesheetCache = new BoundedCache<FontFaceDefinition[]>(64, () => 1);
const binaryCache = new BoundedCache<Uint8Array>(12 * 1024 * 1024, (bytes) => bytes.byteLength);
const trueTypeCache = new BoundedCache<Uint8Array>(16 * 1024 * 1024, (bytes) => bytes.byteLength);
const inflight = new Map<string, Promise<Uint8Array>>();

/** Test hook: forget cached font resources. */
export function clearFontCaches(): void {
  stylesheetCache.clear();
  binaryCache.clear();
  trueTypeCache.clear();
  inflight.clear();
}

async function loadStylesheetFaces(family: string): Promise<FontFaceDefinition[]> {
  const slug = slugForFamily(family);
  const cached = stylesheetCache.get(slug);
  if (cached) return cached;
  const css = await fetchSameOrigin(`/fonts/${slug}.css`, (response) => response.text());
  const faces = parseFontFaceCss(css).filter((face) => face.family.toLowerCase() === family.toLowerCase());
  if (!faces.length) throw new Error(`No @font-face rules for ${family}`);
  stylesheetCache.set(slug, faces);
  return faces;
}

function loadBinary(url: string): Promise<Uint8Array> {
  const cached = binaryCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;
  const request = fetchSameOrigin(url, async (response) => new Uint8Array(await response.arrayBuffer()))
    .then((bytes) => {
      binaryCache.set(url, bytes);
      return bytes;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, request);
  return request;
}

function isWoff2(bytes: Uint8Array): boolean {
  return bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
}

/**
 * Per-export font registry. Exporters first `note` every styled string they
 * will draw, then `load` once: only the families, weights and unicode-range
 * subsets the document uses are fetched, and each file is fetched once.
 */
export class ExportFontRegistry {
  private readonly usage = new Map<string, FamilyUsage>();
  private readonly faces = new Map<string, FontFaceDefinition[]>();
  private readonly unavailable = new Set<string>();
  private readonly loaded = new Map<string, LoadedFont>();
  private readonly fallbackFonts = new Map<string, LoadedFont>();
  private fontkit: FontkitModule | null = null;
  private options: RegistryLoadOptions = { instances: false, fallback: false };
  private loadedOnce = false;

  constructor(private readonly warnings: WarningCollector) {}

  /** Records that `text` is drawn in `style`. */
  note(style: FontStyleRequest, text: string): void {
    const name = style.family.name;
    let entry = this.usage.get(name);
    if (!entry) {
      entry = { family: style.family, weights: new Map(), italic: false, counts: new Map() };
      this.usage.set(name, entry);
    }
    entry.italic ||= style.italic;
    let codePoints = entry.weights.get(style.weight);
    if (!codePoints) {
      codePoints = new Set();
      entry.weights.set(style.weight, codePoints);
    }
    for (const char of text) {
      const codePoint = char.codePointAt(0) as number;
      if (codePoint > 0x20 || codePoint === 0x20) codePoints.add(codePoint);
    }
    entry.counts.set(style.weight, (entry.counts.get(style.weight) ?? 0) + text.length);
  }

  get families(): FamilyUsage[] {
    return Array.from(this.usage.values());
  }

  async load(options: RegistryLoadOptions): Promise<void> {
    this.options = options;
    this.loadedOnce = true;
    // Unknown families render in the document font; make sure it is loaded.
    const bundled = new Map<string, ResolvedFamily>();
    this.usage.forEach((entry) => {
      const family = entry.family.kind === 'bundled' ? entry.family : entry.family.kind === 'unknown' ? resolveFamily(DEFAULT_DOCUMENT_FAMILY) : null;
      if (family) bundled.set(family.name, family);
    });
    await Promise.all(
      Array.from(bundled.values()).map(async (family) => {
        try {
          this.faces.set(family.name, await loadStylesheetFaces(family.name));
        } catch {
          this.unavailable.add(family.name);
          this.warnings.add('font-unavailable', family.name);
        }
      }),
    );

    if (options.instances) this.fontkit = await loadFontkit();
    const jobs = this.plannedFiles();
    await mapWithConcurrency(jobs, 4, async (job) => {
      try {
        await this.loadFile(job.family, job.url, job.ranges, job.renderWeight);
      } catch {
        if (!this.unavailable.has(job.family)) this.warnings.add('font-unavailable', job.family);
        this.unavailable.add(`${job.family}|${job.url}`);
      }
    });

    if (options.fallback && options.instances) await this.loadFallbacks();
  }

  /** Files needed: for each used weight, the subsets whose unicode-range covers a used character. */
  private plannedFiles(): Array<{ family: string; url: string; ranges: UnicodeRange[]; renderWeight: number }> {
    const planned = new Map<string, { family: string; url: string; ranges: UnicodeRange[]; renderWeight: number }>();
    this.usage.forEach((entry) => {
      const family = this.renderFamily(entry.family);
      const faces = this.faces.get(family.name);
      if (!faces) return;
      entry.weights.forEach((codePoints, weight) => {
        const match = matchFontFace(faces, weight);
        if (!match) return;
        const segments = match.face.segments;
        const needed = new Set<number>();
        codePoints.forEach((codePoint) => {
          for (let index = segments.length - 1; index >= 0; index -= 1) {
            if (rangesContain(segments[index].ranges, codePoint)) {
              needed.add(index);
              break;
            }
          }
        });
        // Always load the primary (latin) subset so metrics exist even for empty text.
        if (!needed.size && segments.length) needed.add(segments.length - 1);
        needed.forEach((index) => {
          const segment = segments[index];
          const renderWeight = this.options.instances ? match.renderWeight : 400;
          planned.set(`${family.name}|${segment.url}|${renderWeight}`, {
            family: family.name,
            url: segment.url,
            ranges: segment.ranges,
            renderWeight,
          });
        });
      });
    });
    return Array.from(planned.values());
  }

  private async loadFile(family: string, url: string, ranges: UnicodeRange[], renderWeight: number): Promise<void> {
    const key = `${family}|${url}|${renderWeight}`;
    if (this.loaded.has(key)) return;
    const sourceBytes = await loadBinary(url);
    let font: FontkitFont | null = null;
    if (this.fontkit) {
      const trueType = this.trueTypeFor(url, sourceBytes, this.fontkit);
      const base = this.fontkit.create(trueType);
      font = base.variationAxes?.wght ? base.getVariation({ wght: renderWeight }) : base;
    }
    this.loaded.set(key, {
      key,
      family,
      renderWeight,
      font: font as FontkitFont,
      ranges,
      sourceBytes,
      sourceUrl: url,
      fallback: false,
      italic: false,
    });
  }

  private trueTypeFor(url: string, bytes: Uint8Array, fontkit: FontkitModule): Uint8Array {
    if (!isWoff2(bytes)) return bytes;
    const cached = trueTypeCache.get(url);
    if (cached) return cached;
    const converted = woff2ToTrueType(fontkit.create(bytes));
    trueTypeCache.set(url, converted);
    return converted;
  }

  /** Loads the Noto Sans faces needed for characters no selected font covers. */
  private async loadFallbacks(): Promise<void> {
    const needed = new Map<string, { bold: boolean; italic: boolean }>();
    this.usage.forEach((entry) => {
      entry.weights.forEach((codePoints, weight) => {
        const resolution = this.resolve({ family: entry.family, weight, italic: false });
        for (const codePoint of codePoints) {
          if (codePoint <= 0x20) continue;
          if (resolution.standard && isWinAnsi(codePoint)) continue;
          if (resolution.fonts.some((font) => rangesContain(font.ranges, codePoint) && font.font.hasGlyphForCodePoint(codePoint))) continue;
          const bold = weight >= 600;
          needed.set(`${bold}|false`, { bold, italic: false });
          if (entry.italic) needed.set(`${bold}|true`, { bold, italic: true });
          break;
        }
      });
    });
    await Promise.all(
      Array.from(needed.entries()).map(async ([key, { bold, italic }]) => {
        const url = fallbackFontUrl(bold, italic);
        try {
          const sourceBytes = await loadBinary(url);
          const font = (this.fontkit as FontkitModule).create(sourceBytes);
          this.fallbackFonts.set(key, {
            key: `${FALLBACK_FAMILY}|${url}`,
            family: FALLBACK_FAMILY,
            renderWeight: bold ? 700 : 400,
            font,
            ranges: [[0, 0x10ffff]],
            sourceBytes,
            sourceUrl: url,
            fallback: true,
            italic,
          });
        } catch {
          this.warnings.add('font-unavailable', FALLBACK_FAMILY);
        }
      }),
    );
  }

  /** Noto Sans face for a style, if loaded. */
  fallbackFor(weight: number, italic: boolean): LoadedFont | null {
    const bold = weight >= 600;
    return this.fallbackFonts.get(`${bold}|${italic}`) ?? this.fallbackFonts.get(`${bold}|false`) ?? this.fallbackFonts.get('false|false') ?? null;
  }

  private renderFamily(family: ResolvedFamily): ResolvedFamily {
    if (family.kind === 'unknown' || (family.kind === 'bundled' && this.unavailable.has(family.name))) {
      const fallback = resolveFamily(DEFAULT_DOCUMENT_FAMILY);
      return this.unavailable.has(fallback.name) ? family : fallback;
    }
    return family;
  }

  resolve(style: FontStyleRequest): FaceResolution {
    if (!this.loadedOnce) throw new Error('Font registry used before load()');
    const requested = style.family;
    if (requested.kind === 'system') {
      const bold = style.weight >= 600;
      return {
        requested,
        family: requested,
        cssWeight: style.weight,
        renderWeight: bold ? 700 : 400,
        syntheticBold: false,
        syntheticItalic: false,
        fonts: [],
        standard: requested.standard,
      };
    }
    const family = this.renderFamily(requested);
    const faces = this.faces.get(family.name);
    const match = faces ? matchFontFace(faces, style.weight) : null;
    if (!match) {
      return {
        requested,
        family,
        cssWeight: style.weight,
        renderWeight: style.weight >= 600 ? 700 : 400,
        syntheticBold: false,
        syntheticItalic: style.italic,
        fonts: [],
        // Nothing loaded at all: PDF draws with Helvetica and reports it.
        standard: 'Helvetica',
      };
    }
    const renderWeight = this.options.instances ? match.renderWeight : 400;
    const fonts: LoadedFont[] = [];
    for (let index = match.face.segments.length - 1; index >= 0; index -= 1) {
      const loaded = this.loaded.get(`${family.name}|${match.face.segments[index].url}|${renderWeight}`);
      if (loaded) fonts.push(loaded);
    }
    return {
      requested,
      family,
      cssWeight: style.weight,
      renderWeight: match.renderWeight,
      syntheticBold: match.syntheticBold,
      syntheticItalic: style.italic && match.face.style !== 'italic',
      fonts,
    };
  }

  /** The @font-face rules of a family (for HTML export). */
  facesOf(family: string): FontFaceDefinition[] | undefined {
    return this.faces.get(family);
  }

  /** Loaded files for one family, any weight. */
  loadedFonts(family?: string): LoadedFont[] {
    return Array.from(this.loaded.values()).filter((font) => !family || font.family === family);
  }

  isUnavailable(family: string): boolean {
    return this.unavailable.has(family);
  }
}

/** Characters the PDF base-14 fonts can draw with WinAnsiEncoding. */
export function isWinAnsi(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true;
  return WIN_ANSI_EXTRA.has(codePoint);
}

const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
