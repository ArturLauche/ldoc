import { isWinAnsi, type ExportFontRegistry, type FaceResolution, type LoadedFont } from '../fonts/registry';
import { bidiLevels, directionalRuns, hasRtlText, reorderByLevels, type BidiDirection } from '../bidi';
import { shapeText, splitGraphemes } from '../fonts/shaping';
import { DOCUMENT_STYLE, type RunStyle, type TextBaseStyle } from '../typography';
import type { ExportAlignment } from '../types';
import type { WarningCollector } from '../warnings';
import type { FontMetrics, PdfFontSet, PdfTextFont, StandardTextFont } from './fonts';

/**
 * Inline layout for PDF: shapes styled runs with the document's real fonts,
 * breaks them into line boxes like the editor's CSS (line-height half
 * leading, trailing spaces hang, `overflow-wrap: anywhere`), and aligns or
 * justifies them. All lengths are CSS px.
 */

export interface StyledRun {
  text: string;
  style: RunStyle;
  href?: string;
}

export interface PlacedGlyph {
  id: number;
  /** Text the glyph represents (ToUnicode / standard-font encoding). */
  text: string;
  advance: number;
  xOffset: number;
  yOffset: number;
}

/** Characters no embeddable font covers; drawn as images by a rasterizer when available. */
export interface MissingText {
  text: string;
  width: number;
  ascent: number;
  descent: number;
}

export interface GlyphRasterizer {
  measure(text: string, style: RunStyle): { width: number; ascent: number; descent: number } | null;
}

interface Cluster {
  text: string;
  width: number;
  glyphs: PlacedGlyph[];
  font: PdfTextFont | null;
  metrics: FontMetrics;
  run: number;
  space: boolean;
  hardBreak: boolean;
  breakAfter: boolean;
  missing?: MissingText;
  padStart: number;
  padEnd: number;
  /** UTF-16 range in the paragraph's combined text. */
  start: number;
  end: number;
  /** Bidi embedding level (0 LTR, 1 RTL, 2 embedded LTR). */
  level: number;
  /** False for trailing spaces, which hang and are not justified. */
  stretchable: boolean;
}

export interface LinePiece {
  run: number;
  font: PdfTextFont | null;
  metrics: FontMetrics;
  /** Offset from the line's start (after alignment), px. */
  x: number;
  width: number;
  glyphs: PlacedGlyph[];
  /** Extra advance after each glyph that ends a space cluster (justification). */
  spaceExtra: number;
  /** Number of non-trailing spaces merged into this piece. */
  stretchableSpaces: number;
  text: string;
  missing?: MissingText;
  padStart: number;
  padEnd: number;
}

export interface LayoutLine {
  pieces: LinePiece[];
  /** Width of the content (without hanging spaces), px. */
  width: number;
  height: number;
  /** Baseline distance from the line top, px. */
  baseline: number;
  /** Start offset within the available width (alignment), px. */
  offset: number;
  /** Offset of the available area itself (floats), px from the container start. */
  inset: number;
}

export interface InlineEnvironment {
  registry: ExportFontRegistry;
  fonts: PdfFontSet;
  warnings: WarningCollector;
  rasterizer: GlyphRasterizer | null;
}

const BREAK_AFTER = /[\s\u2010\u2013\u2014-]$/u;
const CJK = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/u;

/** Whether a line break may sit between two adjacent graphemes. */
function breakBetween(previous: string, next: string): boolean {
  return (
    previous === '\n' ||
    next === '\n' ||
    /^\s+$/u.test(previous) ||
    BREAK_AFTER.test(previous) ||
    CJK.test(previous) ||
    CJK.test(next)
  );
}

/**
 * Groups text no embeddable font covers into clusters that keep unbreakable
 * character sequences together: the rasterizer draws each cluster through
 * the browser's system fonts, which shape whole sequences — Arabic's joined
 * letterforms among them — while per-character clusters would print isolated
 * forms. Whitespace runs, hyphen ends and CJK boundaries stay break points,
 * like the CSS fragmentation the print document uses.
 */
function missingChunks(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  let previous: string | null = null;
  for (const grapheme of splitGraphemes(text)) {
    if (previous !== null && !breakBetween(previous, grapheme)) current += grapheme;
    else {
      if (current) chunks.push(current);
      current = grapheme;
    }
    previous = grapheme;
  }
  if (current) chunks.push(current);
  return chunks;
}

function standardFamilyFont(env: InlineEnvironment, resolution: FaceResolution, style: RunStyle): StandardTextFont {
  return env.fonts.forStandard(resolution.standard ?? 'Helvetica', style.weight >= 600, style.italic);
}

function fallbackMetrics(sizeless: FontMetrics | null): FontMetrics {
  return (
    sizeless ?? {
      unitsPerEm: 1000,
      ascent: 900,
      descent: -250,
      underlinePosition: -100,
      underlineThickness: 50,
      strikeoutPosition: 280,
      strikeoutSize: 50,
    }
  );
}

/** Shapes one styled run into clusters. */
function runClusters(
  env: InlineEnvironment,
  run: StyledRun,
  index: number,
  start: number,
  direction: BidiDirection,
  capWidth: number,
): Cluster[] {
  const { style } = run;
  const resolution = env.registry.resolve({ family: style.family, weight: style.weight, italic: style.italic });
  if (resolution.requested.kind !== 'system' && resolution.family.name !== resolution.requested.name) {
    env.warnings.add('font-substituted', resolution.requested.name);
  }
  if (resolution.standard && resolution.requested.kind !== 'system') {
    env.warnings.add('pdf-font-fallback');
  }
  if (resolution.requested.kind === 'system' && !resolution.requested.metricCompatible) {
    env.warnings.add('font-substituted', resolution.requested.name);
  }
  const fallback = env.registry.fallbackFor(style.weight, style.italic);
  const clusters: Cluster[] = [];
  const pushText = (
    text: string,
    font: PdfTextFont | null,
    metrics: FontMetrics,
    glyphs: PlacedGlyph[],
    width: number,
    from: number,
    to: number,
    missing?: MissingText,
  ) => {
    clusters.push({
      text,
      width,
      glyphs,
      font,
      metrics,
      run: index,
      space: /^\s+$/u.test(text) && text !== '\u00a0',
      hardBreak: text === '\n',
      breakAfter: false,
      ...(missing ? { missing } : {}),
      padStart: 0,
      padEnd: 0,
      start: from,
      end: to,
      level: 0,
      stretchable: true,
    });
  };
  const missingCluster = (text: string, metrics: FontMetrics, from: number, to: number) => {
    const measured = env.rasterizer?.measure(text, style) ?? null;
    if (!measured) {
      env.warnings.add('pdf-glyph-missing', text);
      return;
    }
    env.warnings.add('pdf-glyph-rasterized');
    if (capWidth > 0 && measured.width > capWidth) {
      // Joined shapes stay whole while chunks fit a line; a chunk wider than
      // the widest line (scripts without spaces, like Thai, can build them)
      // would overflow instead of wrapping, so its characters break anywhere
      // like the editor's `overflow-wrap: anywhere` fallback.
      let cursor = from;
      splitGraphemes(text).forEach((grapheme) => {
        const piece = env.rasterizer?.measure(grapheme, style) ?? null;
        if (piece) {
          pushText(grapheme, null, metrics, [], piece.width, cursor, cursor + grapheme.length, { text: grapheme, ...piece });
        }
        cursor += grapheme.length;
      });
      return;
    }
    pushText(text, null, metrics, [], measured.width, from, to, { text, ...measured });
  };

  if (resolution.standard) {
    const standard = standardFamilyFont(env, resolution, style);
    const graphemes = splitGraphemes(run.text);
    const ansiGrapheme = (grapheme: string): boolean =>
      Array.from(grapheme).every((char) => isWinAnsi(char.codePointAt(0) as number));
    const shapedSegment = (grapheme: string, from: number) => {
      const direction: BidiDirection = hasRtlText(grapheme) ? 'rtl' : 'ltr';
      const shaped = fallback
        ? shapeText(grapheme, { ...resolution, fonts: [], standard: undefined }, fallback, direction, from)
        : [];
      return shaped[0] ?? null;
    };
    let index = 0;
    let cursor = start;
    while (index < graphemes.length) {
      const grapheme = graphemes[index] as string;
      const from = cursor;
      const to = from + grapheme.length;
      if (grapheme === '\n') {
        pushText('\n', standard, standard.metrics, [], 0, from, to);
        cursor = to;
        index += 1;
        continue;
      }
      if (ansiGrapheme(grapheme)) {
        const text = grapheme === '\t' ? ' ' : grapheme;
        pushText(
          grapheme,
          standard,
          standard.metrics,
          [{ id: 0, text, advance: standard.width(text, style.sizePx), xOffset: 0, yOffset: 0 }],
          standard.width(text, style.sizePx),
          from,
          to,
        );
        cursor = to;
        index += 1;
        continue;
      }
      const segment = shapedSegment(grapheme, from);
      if (segment?.font) {
        appendShaped(env, segment.font, segment.glyphs, segment.clusters, grapheme, style, pushText, from);
        cursor = to;
        index += 1;
        continue;
      }
      // Uncovered: extend over the unbreakable run so the rasterizer draws it
      // shaped the way the browser does, not as isolated letterforms.
      let chunk = grapheme;
      let last = grapheme;
      let end = index + 1;
      while (end < graphemes.length) {
        const next = graphemes[end] as string;
        if (next === '\n' || ansiGrapheme(next) || shapedSegment(next, from)?.font || breakBetween(last, next)) break;
        chunk += next;
        last = next;
        end += 1;
      }
      missingCluster(chunk, standard.metrics, from, from + chunk.length);
      cursor = from + chunk.length;
      index = end;
    }
    return clusters;
  }

  const primaryMetrics = resolution.fonts[0] ? env.fonts.forLoaded(resolution.fonts[0]).metrics : null;
  directionalRuns(run.text, direction).forEach((part) => {
    const text = run.text.slice(part.start, part.end);
    shapeText(text, resolution, fallback, part.direction, start + part.start).forEach((segment) => {
      if (segment.text === '\n') {
        pushText('\n', null, fallbackMetrics(primaryMetrics), [], 0, segment.start, segment.end);
        return;
      }
      if (!segment.font) {
        let cursor = segment.start;
        missingChunks(segment.text).forEach((chunk) => {
          const from = cursor;
          const to = from + chunk.length;
          cursor = to;
          if (chunk === '\n') pushText('\n', null, fallbackMetrics(primaryMetrics), [], 0, from, to);
          else missingCluster(chunk, fallbackMetrics(primaryMetrics), from, to);
        });
        return;
      }
      appendShaped(env, segment.font, segment.glyphs, segment.clusters, run.text, style, pushText, start);
    });
  });
  return clusters;
}

/**
 * Places one shaped segment's glyphs into clusters. Cluster offsets are
 * absolute within the paragraph; `source` starts at the paragraph offset
 * `sourceStart`, so text is sliced from `source` at the cluster's relative
 * position (a later run's clusters would otherwise slice out of range and
 * register every glyph without the text it represents).
 */
function appendShaped(
  env: InlineEnvironment,
  loaded: LoadedFont,
  glyphs: Array<{ id: number; advance: number; xOffset: number; yOffset: number; cluster: number }>,
  clusters: Array<{ start: number; end: number; advance: number }>,
  source: string,
  style: RunStyle,
  push: (
    text: string,
    font: PdfTextFont | null,
    metrics: FontMetrics,
    glyphs: PlacedGlyph[],
    width: number,
    from: number,
    to: number,
  ) => void,
  sourceStart: number,
): void {
  const font = env.fonts.forLoaded(loaded);
  const factor = style.sizePx / loaded.font.unitsPerEm;
  let glyphIndex = 0;
  clusters.forEach((cluster) => {
    const text = source.slice(cluster.start - sourceStart, cluster.end - sourceStart);
    const placed: PlacedGlyph[] = [];
    while (glyphIndex < glyphs.length && glyphs[glyphIndex].cluster < cluster.end) {
      const glyph = glyphs[glyphIndex];
      placed.push({
        id: glyph.id,
        text: placed.length ? '' : text,
        advance: glyph.advance * factor,
        xOffset: glyph.xOffset * factor,
        yOffset: glyph.yOffset * factor,
      });
      glyphIndex += 1;
    }
    if (text.includes('\n')) {
      push('\n', font, font.metrics, [], 0, cluster.start, cluster.end);
      return;
    }
    push(text, font, font.metrics, placed, cluster.advance * factor, cluster.start, cluster.end);
  });
}

/** Marks where lines may break, and adds the editor's highlight padding. */
function prepareClusters(clusters: Cluster[], runs: StyledRun[]): void {
  clusters.forEach((cluster, index) => {
    const next = clusters[index + 1];
    cluster.breakAfter =
      cluster.space ||
      (BREAK_AFTER.test(cluster.text) && Boolean(next) && !next.space) ||
      (CJK.test(cluster.text) || Boolean(next && CJK.test(next.text)));
  });
  // `mark` has 2px 4px padding; inline padding adds space at its start and end.
  for (let index = 0; index < clusters.length; index += 1) {
    const highlight = runs[clusters[index].run].style.highlight;
    if (!highlight) continue;
    const previous = clusters[index - 1];
    if (!previous || runs[previous.run].style.highlight !== highlight) clusters[index].padStart = DOCUMENT_STYLE.mark.paddingX;
    const next = clusters[index + 1];
    if (!next || runs[next.run].style.highlight !== highlight) clusters[index].padEnd = DOCUMENT_STYLE.mark.paddingX;
  }
}

export interface LineSlot {
  /** Offset from the container's content start, px. */
  inset: number;
  width: number;
}

export interface InlineLayoutOptions {
  base: TextBaseStyle;
  baseMetrics: FontMetrics;
  align?: ExportAlignment;
  /** Paragraph base direction; `dir="auto"` resolved by the document. */
  direction?: BidiDirection;
  /**
   * Widest line the paragraph can hold, px: missing-font chunks wider than it
   * fragment at grapheme boundaries (the `overflow-wrap: anywhere` fallback)
   * instead of overflowing; chunks that fit stay whole, so joined scripts
   * keep their shapes.
   */
  slotWidth?: number;
  /** Available width for a line starting `y` px below the paragraph top. */
  slotAt: (y: number, height: number) => LineSlot;
}

function clusterWidth(cluster: Cluster): number {
  return cluster.width + cluster.padStart + cluster.padEnd;
}

/** Shapes and lines a paragraph's runs. */
export function layoutInline(env: InlineEnvironment, runs: StyledRun[], options: InlineLayoutOptions): LayoutLine[] {
  const direction: BidiDirection = options.direction ?? 'ltr';
  const combined = runs.map((run) => run.text).join('');
  const levels = bidiLevels(combined, direction);
  let runStart = 0;
  const clusters = runs.flatMap((run, index) => {
    const shaped = runClusters(env, run, index, runStart, direction, options.slotWidth ?? 0);
    runStart += run.text.length;
    return shaped;
  });
  const baseLevel = direction === 'rtl' ? 1 : 0;
  clusters.forEach((cluster) => {
    cluster.level = levels[cluster.start] ?? baseLevel;
  });
  prepareClusters(clusters, runs);
  // In an RTL run the logical start is the visual right edge: its padding
  // belongs after the glyphs, not before them.
  clusters.forEach((cluster) => {
    if (cluster.level % 2 === 1) {
      const pad = cluster.padStart;
      cluster.padStart = cluster.padEnd;
      cluster.padEnd = pad;
    }
  });
  const strut = lineMetricsFor(options.baseMetrics, options.base.sizePx, options.base.lineHeight, 0);
  const lines: LayoutLine[] = [];
  let y = 0;
  let index = 0;
  const pushLine = (from: number, to: number, slot: LineSlot, endsParagraph: boolean) => {
    const line = buildLine(clusters.slice(from, to), runs, strut, slot, options.align, endsParagraph, direction);
    lines.push(line);
    y += line.height;
  };
  if (!clusters.length) {
    const slot = options.slotAt(0, strut.height);
    lines.push({ pieces: [], width: 0, height: strut.height, baseline: strut.above, offset: 0, inset: slot.inset });
    return lines;
  }
  while (index < clusters.length) {
    const slot = options.slotAt(y, strut.height);
    let width = 0;
    let end = index;
    let lastBreak = -1;
    while (end < clusters.length) {
      const cluster = clusters[end];
      if (cluster.hardBreak) break;
      const nextWidth = width + clusterWidth(cluster);
      // ProseMirror sets `white-space: break-spaces`: a space at the end of a
      // line takes room like any character, so it must fit too.
      if (nextWidth > slot.width + 0.01 && end > index) break;
      width = nextWidth;
      if (cluster.breakAfter) lastBreak = end;
      end += 1;
    }
    if (end < clusters.length && clusters[end].hardBreak) {
      pushLine(index, end, slot, true);
      index = end + 1;
      if (index >= clusters.length) {
        // A trailing line break still creates an empty line.
        pushLine(index, index, options.slotAt(y, strut.height), true);
      }
      continue;
    }
    if (end >= clusters.length) {
      pushLine(index, end, slot, true);
      break;
    }
    // Overflow: break after the last opportunity, else anywhere (overflow-wrap: anywhere).
    // Spaces past the break stay at the start of the next line (break-spaces),
    // so only the line break itself is consumed.
    const breakAt = lastBreak >= index ? lastBreak + 1 : Math.max(end, index + 1);
    pushLine(index, breakAt, slot, false);
    index = breakAt;
  }
  return lines;
}

interface LineMetrics {
  above: number;
  below: number;
  height: number;
}

function lineMetricsFor(metrics: FontMetrics, sizePx: number, lineHeight: number, shift: number): LineMetrics {
  const ascent = (metrics.ascent / metrics.unitsPerEm) * sizePx;
  const descent = (-metrics.descent / metrics.unitsPerEm) * sizePx;
  const leading = lineHeight * sizePx - (ascent + descent);
  const above = ascent + leading / 2 - shift;
  const below = descent + leading / 2 + shift;
  return { above, below, height: above + below };
}

export function baselineShift(style: RunStyle): number {
  if (style.superscript) return -DOCUMENT_STYLE.script.superShift * style.sizePx;
  if (style.subscript) return DOCUMENT_STYLE.script.subShift * style.sizePx;
  return 0;
}

function buildLine(
  clusters: Cluster[],
  runs: StyledRun[],
  strut: LineMetrics,
  slot: LineSlot,
  align: ExportAlignment | undefined,
  endsParagraph: boolean,
  direction: BidiDirection,
): LayoutLine {
  // Trailing spaces stay on the line (break-spaces) but are not stretched.
  let trimmed = clusters.length;
  while (trimmed > 0 && clusters[trimmed - 1].space) trimmed -= 1;
  clusters.forEach((cluster, index) => {
    cluster.stretchable = index < trimmed || !cluster.space;
  });
  const visible = reorderByLevels(clusters, clusters.map((cluster) => cluster.level));
  let above = strut.above;
  let below = strut.below;
  const pieces: LinePiece[] = [];
  let x = 0;
  let lastTrailing = false;
  visible.forEach((cluster) => {
    // Start a new piece at the first trailing space so justification can
    // stretch the inner spaces without also stretching the hanging ones.
    const trailing = cluster.space && !cluster.stretchable;
    const startsTrailing = trailing && !lastTrailing;
    const style = runs[cluster.run].style;
    const metrics = lineMetricsFor(cluster.metrics, style.sizePx, style.lineHeight, baselineShift(style));
    if (style.lineHeight > 0) {
      above = Math.max(above, metrics.above);
      below = Math.max(below, metrics.below);
    }
    const last = pieces[pieces.length - 1];
    const stretchableSpaces = cluster.space && cluster.stretchable ? 1 : 0;
    x += cluster.padStart;
    if (last && !startsTrailing && last.run === cluster.run && last.font === cluster.font && !cluster.missing && !last.missing && !cluster.padStart) {
      last.glyphs.push(...cluster.glyphs);
      last.text += cluster.text;
      last.width += cluster.width;
      last.padEnd = cluster.padEnd;
      last.stretchableSpaces += stretchableSpaces;
    } else {
      pieces.push({
        run: cluster.run,
        font: cluster.font,
        metrics: cluster.metrics,
        x,
        width: cluster.width,
        glyphs: [...cluster.glyphs],
        spaceExtra: 0,
        stretchableSpaces,
        text: cluster.text,
        ...(cluster.missing ? { missing: cluster.missing } : {}),
        padStart: cluster.padStart,
        padEnd: cluster.padEnd,
      });
    }
    lastTrailing = trailing;
    x += cluster.width + cluster.padEnd;
  });
  const width = x;
  const free = Math.max(0, slot.width - width);
  const effectiveAlign = align ?? (direction === 'rtl' ? 'right' : 'left');
  let offset = 0;
  if (effectiveAlign === 'center') offset = free / 2;
  else if (effectiveAlign === 'right') offset = free;
  else if (effectiveAlign === 'justify' && !endsParagraph) {
    const spaces = visible.reduce((count, cluster) => count + (cluster.space && cluster.stretchable ? 1 : 0), 0);
    if (spaces > 0 && free > 0) {
      const extra = free / spaces;
      // Re-flow piece offsets with the extra space after each inner space.
      let shift = 0;
      pieces.forEach((piece) => {
        piece.x += shift;
        const count = piece.stretchableSpaces;
        piece.spaceExtra = count ? extra : 0;
        piece.width += count * extra;
        shift += count * extra;
      });
    }
  }
  return {
    pieces,
    width: effectiveAlign === 'justify' && !endsParagraph ? Math.max(width, slot.width) : width,
    height: above + below,
    baseline: above,
    offset,
    inset: slot.inset,
  };
}
