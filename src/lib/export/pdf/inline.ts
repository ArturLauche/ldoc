import { isWinAnsi, type ExportFontRegistry, type FaceResolution, type LoadedFont } from '../fonts/registry';
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
function runClusters(env: InlineEnvironment, run: StyledRun, index: number): Cluster[] {
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
  const pushText = (text: string, font: PdfTextFont | null, metrics: FontMetrics, glyphs: PlacedGlyph[], width: number, missing?: MissingText) => {
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
    });
  };
  const missingCluster = (grapheme: string, metrics: FontMetrics) => {
    const measured = env.rasterizer?.measure(grapheme, style) ?? null;
    if (measured) {
      env.warnings.add('pdf-glyph-rasterized');
      pushText(grapheme, null, metrics, [], measured.width, { text: grapheme, ...measured });
    } else {
      env.warnings.add('pdf-glyph-missing', grapheme);
    }
  };

  if (resolution.standard) {
    const standard = standardFamilyFont(env, resolution, style);
    splitGraphemes(run.text).forEach((grapheme) => {
      if (grapheme === '\n') {
        pushText('\n', standard, standard.metrics, [], 0);
        return;
      }
      const ansi = Array.from(grapheme).every((char) => isWinAnsi(char.codePointAt(0) as number));
      if (ansi) {
        const text = grapheme === '\t' ? ' ' : grapheme;
        pushText(grapheme, standard, standard.metrics, [{ id: 0, text, advance: standard.width(text, style.sizePx), xOffset: 0, yOffset: 0 }], standard.width(text, style.sizePx));
        return;
      }
      const shaped = fallback ? shapeText(grapheme, { ...resolution, fonts: [], standard: undefined }, fallback) : [];
      const segment = shaped[0];
      if (segment?.font) {
        appendShaped(env, segment.font, segment.glyphs, segment.clusters, grapheme, style, pushText);
      } else {
        missingCluster(grapheme, standard.metrics);
      }
    });
    return clusters;
  }

  const primaryMetrics = resolution.fonts[0] ? env.fonts.forLoaded(resolution.fonts[0]).metrics : null;
  shapeText(run.text, resolution, fallback).forEach((segment) => {
    if (segment.text === '\n') {
      pushText('\n', null, fallbackMetrics(primaryMetrics), [], 0);
      return;
    }
    if (!segment.font) {
      splitGraphemes(segment.text).forEach((grapheme) => {
        if (grapheme === '\n') pushText('\n', null, fallbackMetrics(primaryMetrics), [], 0);
        else missingCluster(grapheme, fallbackMetrics(primaryMetrics));
      });
      return;
    }
    appendShaped(env, segment.font, segment.glyphs, segment.clusters, run.text, style, pushText);
  });
  return clusters;
}

function appendShaped(
  env: InlineEnvironment,
  loaded: LoadedFont,
  glyphs: Array<{ id: number; advance: number; xOffset: number; yOffset: number; cluster: number }>,
  clusters: Array<{ start: number; end: number; advance: number }>,
  source: string,
  style: RunStyle,
  push: (text: string, font: PdfTextFont | null, metrics: FontMetrics, glyphs: PlacedGlyph[], width: number) => void,
): void {
  const font = env.fonts.forLoaded(loaded);
  const factor = style.sizePx / loaded.font.unitsPerEm;
  let glyphIndex = 0;
  clusters.forEach((cluster) => {
    const text = source.slice(cluster.start, cluster.end);
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
      push('\n', font, font.metrics, [], 0);
      return;
    }
    push(text, font, font.metrics, placed, cluster.advance * factor);
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
  /** Available width for a line starting `y` px below the paragraph top. */
  slotAt: (y: number, height: number) => LineSlot;
}

function clusterWidth(cluster: Cluster): number {
  return cluster.width + cluster.padStart + cluster.padEnd;
}

/** Shapes and lines a paragraph's runs. */
export function layoutInline(env: InlineEnvironment, runs: StyledRun[], options: InlineLayoutOptions): LayoutLine[] {
  const clusters = runs.flatMap((run, index) => runClusters(env, run, index));
  prepareClusters(clusters, runs);
  const strut = lineMetricsFor(options.baseMetrics, options.base.sizePx, options.base.lineHeight, 0);
  const lines: LayoutLine[] = [];
  let y = 0;
  let index = 0;
  const pushLine = (from: number, to: number, slot: LineSlot, endsParagraph: boolean) => {
    const line = buildLine(clusters.slice(from, to), runs, strut, slot, options.align, endsParagraph);
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
    const breakAt = lastBreak >= index ? lastBreak + 1 : Math.max(end, index + 1);
    let next = breakAt;
    pushLine(index, breakAt, slot, false);
    while (next < clusters.length && clusters[next].space && !clusters[next].hardBreak) next += 1;
    index = next;
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
): LayoutLine {
  // Trailing spaces stay on the line (break-spaces) but are not stretched.
  let trimmed = clusters.length;
  while (trimmed > 0 && clusters[trimmed - 1].space) trimmed -= 1;
  const visible = clusters;
  let above = strut.above;
  let below = strut.below;
  const pieces: LinePiece[] = [];
  let x = 0;
  visible.forEach((cluster) => {
    const style = runs[cluster.run].style;
    const metrics = lineMetricsFor(cluster.metrics, style.sizePx, style.lineHeight, baselineShift(style));
    if (style.lineHeight > 0) {
      above = Math.max(above, metrics.above);
      below = Math.max(below, metrics.below);
    }
    const last = pieces[pieces.length - 1];
    x += cluster.padStart;
    if (last && last.run === cluster.run && last.font === cluster.font && !cluster.missing && !last.missing && !cluster.padStart) {
      last.glyphs.push(...cluster.glyphs);
      last.text += cluster.text;
      last.width += cluster.width;
      last.padEnd = cluster.padEnd;
    } else {
      pieces.push({
        run: cluster.run,
        font: cluster.font,
        metrics: cluster.metrics,
        x,
        width: cluster.width,
        glyphs: [...cluster.glyphs],
        spaceExtra: 0,
        text: cluster.text,
        ...(cluster.missing ? { missing: cluster.missing } : {}),
        padStart: cluster.padStart,
        padEnd: cluster.padEnd,
      });
    }
    x += cluster.width + cluster.padEnd;
  });
  const width = x;
  const free = Math.max(0, slot.width - width);
  let offset = 0;
  if (align === 'center') offset = free / 2;
  else if (align === 'right') offset = free;
  else if (align === 'justify' && !endsParagraph) {
    const spaces = clusters.slice(0, trimmed).filter((cluster) => cluster.space).length;
    if (spaces > 0 && free > 0) {
      const extra = free / spaces;
      // Re-flow piece offsets with the extra space after each inner space.
      let shift = 0;
      let remaining = spaces;
      pieces.forEach((piece) => {
        piece.x += shift;
        const count = Math.min(remaining, Array.from(piece.text).filter((char) => /\s/u.test(char) && char !== '\u00a0').length);
        remaining -= count;
        piece.spaceExtra = count ? extra : 0;
        piece.width += count * extra;
        shift += count * extra;
      });
    }
  }
  return {
    pieces,
    width: align === 'justify' && !endsParagraph ? Math.max(width, slot.width) : width,
    height: above + below,
    baseline: above,
    offset,
    inset: slot.inset,
  };
}
