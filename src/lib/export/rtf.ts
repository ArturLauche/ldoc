import { toHex } from './color';
import {
  DEFAULT_DOCUMENT_FAMILY,
  MONOSPACE_FAMILY,
  isMonospaceFamily,
  officeFontClass,
  resolveFamily,
  type ResolvedFamily,
} from './fonts/catalog';
import { ExportFontRegistry } from './fonts/registry';
import { noteGraphicFonts, prepareGraphicRenditions } from './graphics/renditions';
import {
  buildTableGrid,
  bytesToHex,
  getVisibleTextFromRuns,
  graphicAltText,
  graphicToFallbackBlocks,
  imageLabel,
  imagePlaceholderRuns,
  resolveColumnWidths,
  walkBlocks,
} from './shared';
import { styledRuns } from './textUsage';
import {
  DOCUMENT_STYLE,
  flowLeaves,
  lineBoxPx,
  pageGeometry,
  textBaseStyle,
  type FlowLeaf,
  type MarginContext,
  type PageGeometry,
  type RunStyle,
  type TextContext,
} from './typography';
import type {
  ExportAlignment,
  ExportBlock,
  ExportCodeBlock,
  ExportDocumentModel,
  ExportGraphicBlock,
  ExportImageBlock,
  ExportInlineRun,
  ExportListBlock,
  ExportTableBlock,
  ExportTextBlock,
  PreparedExportImage,
} from './types';
import type { WarningCollector } from './warnings';

/**
 * RTF 1.9: headings with outline levels, real list numbering, native tables
 * (merged cells, shading, borders, widths), PNG/JPEG pictures with alt text,
 * floating images, hyperlink fields, colors and highlights, and the page
 * size. RTF cannot carry fonts, so text keeps the font names and shows in a
 * substitute where they are not installed (reported as a warning).
 */
export async function renderRtf(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  let hasScenes = false;
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'graphic' && block.scene) hasScenes = true;
  });
  if (hasScenes) {
    // Graphic pictures are drawn with outlined text, which needs the fonts.
    const registry = new ExportFontRegistry(warnings);
    noteGraphicFonts(registry, documentModel);
    await registry.load({ instances: true, fallback: false });
    await prepareGraphicRenditions(documentModel, registry, warnings);
  }

  const writer = new RtfWriter(pageGeometry(documentModel.locale), warnings);
  const body = writer.flow(documentModel.blocks, 'root', { indent: 0, inTable: false }).join('\n');
  if (writer.usesBundledFonts) warnings.add('font-not-embedded');
  const rtf = writer.document(body, documentModel.name, documentModel.locale);
  return new Blob([rtf], { type: 'application/rtf' });
}

const LCIDS: Record<string, number> = {
  en: 1033,
  de: 1031,
  es: 3082,
  fr: 1036,
  it: 1040,
  pt: 2070,
  nl: 1043,
  ja: 1041,
  zh: 2052,
  ar: 1025,
  ru: 1049,
};

/** CSS px → twips. */
const twips = (px: number) => Math.round(px * 15);
/** CSS px → half points. */
const halfPoints = (px: number) => Math.max(2, Math.round(px * 1.5));

/** Escapes text: RTF specials, line breaks and tabs, and non-ASCII as `\uN?` (UTF-16 units). */
export function rtfText(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const char = text[index];
    if (char === '\\' || char === '{' || char === '}') result += `\\${char}`;
    else if (char === '\n') result += '\\line ';
    else if (char === '\t') result += '\\tab ';
    else if (code >= 0x20 && code <= 0x7e) result += char;
    else if (code < 0x20) continue;
    else result += `\\u${code > 0x7fff ? code - 0x10000 : code}?`;
  }
  return result;
}

const BULLETS = { disc: 0x2022, circle: 0x25e6, square: 0x25aa } as const;
type ListKind = 'decimal' | keyof typeof BULLETS;

interface FlowScope {
  indent: number;
  inTable: boolean;
  cell?: { context: TextContext; align?: ExportAlignment };
}

interface ParagraphOptions {
  before: number;
  after: number;
  /** Line box height in px (at least), or a negative value for exact. */
  line?: number;
  left?: number;
  firstLine?: number;
  right?: number;
  align?: ExportAlignment;
  style?: 1 | 2 | 3;
  keepNext?: boolean;
  inTable: boolean;
  list?: string;
  borders?: string;
  shading?: number;
  /** Paragraph mark size (half points), for empty rule paragraphs. */
  markSize?: number;
}

class RtfWriter {
  private readonly fonts = new Map<string, { index: number; family: ResolvedFamily }>();
  private readonly colors = new Map<string, number>();
  private readonly lists: string[] = [];
  private readonly listOverrides: string[] = [];
  private readonly listIds = new Map<ExportListBlock, number>();
  usesBundledFonts = false;

  constructor(
    private readonly geometry: PageGeometry,
    private readonly warnings: WarningCollector,
  ) {
    this.font(resolveFamily(DEFAULT_DOCUMENT_FAMILY));
  }

  private font(family: ResolvedFamily): number {
    let entry = this.fonts.get(family.name);
    if (!entry) {
      entry = { index: this.fonts.size, family };
      this.fonts.set(family.name, entry);
    }
    if (family.kind === 'bundled') this.usesBundledFonts = true;
    return entry.index;
  }

  private color(hex: string): number {
    const key = hex.toUpperCase();
    let index = this.colors.get(key);
    if (!index) {
      index = this.colors.size + 1;
      this.colors.set(key, index);
    }
    return index;
  }

  document(body: string, name: string, locale: string): string {
    const fontTable = Array.from(this.fonts.values())
      .map(({ index, family }) => {
        const pitch = isMonospaceFamily(family) ? 1 : 2;
        return `{\\f${index}\\f${officeFontClass(family) === 'decorative' ? 'decor' : officeFontClass(family)}\\fcharset0\\fprq${pitch} ${rtfText(family.name)};}`;
      })
      .join('');
    const colorTable = Array.from(this.colors.keys())
      .map((hex) => `\\red${Number.parseInt(hex.slice(0, 2), 16)}\\green${Number.parseInt(hex.slice(2, 4), 16)}\\blue${Number.parseInt(hex.slice(4, 6), 16)};`)
      .join('');
    const style = DOCUMENT_STYLE;
    const text = this.colors.get(style.color) ?? 0;
    const heading = (level: 1 | 2 | 3) => {
      const spec = style.headings[level];
      return `{\\s${level}\\sb${twips(spec.marginTop)}\\sa${twips(spec.marginBottom)}\\keepn\\outlinelevel${level - 1}\\sbasedon0\\snext0\\f0\\fs${halfPoints(spec.sizePx)}\\b\\cf${text} heading ${level};}`;
    };
    const stylesheet = `{\\stylesheet{\\s0\\snext0\\f0\\fs${halfPoints(style.sizePx)}\\cf${text} Normal;}${heading(1)}${heading(2)}${heading(3)}}`;
    const lists = this.lists.length
      ? `{\\*\\listtable${this.lists.join('')}}{\\*\\listoverridetable${this.listOverrides.join('')}}`
      : '';
    const now = new Date();
    const created = `\\yr${now.getFullYear()}\\mo${now.getMonth() + 1}\\dy${now.getDate()}\\hr${now.getHours()}\\min${now.getMinutes()}`;
    const info = `{\\info{\\title ${rtfText(name.trim() || 'Untitled')}}{\\author LWrite}{\\creatim${created}}{\\revtim${created}}}`;
    const page = `\\paperw${Math.round(this.geometry.widthPt * 20)}\\paperh${Math.round(this.geometry.heightPt * 20)}\\margl${Math.round(this.geometry.marginPt * 20)}\\margr${Math.round(this.geometry.marginPt * 20)}\\margt${Math.round(this.geometry.marginPt * 20)}\\margb${Math.round(this.geometry.marginPt * 20)}`;
    return `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0\\deflang${LCIDS[locale] ?? 1033}
{\\fonttbl${fontTable}}
{\\colortbl;${colorTable}}
${stylesheet}
${lists}
${info}
{\\*\\generator LWrite;}${page}\\deftab720\\viewkind4\\uc1
${body}
}`;
  }

  /** Renders the blocks of one flow (the page, or a table cell) as paragraphs and rows. */
  flow(blocks: ExportBlock[], container: MarginContext['container'], scope: FlowScope): string[] {
    const { leaves, trailing } = flowLeaves(blocks, container);
    const parts: Array<{ render: (after: number) => string; table?: boolean }> = [];
    leaves.forEach((leaf, index) => {
      const before = container === 'root' && index === 0 ? 0 : leaf.spaceBefore;
      const block = leaf.block;
      if (block.type === 'image' && block.float && block.prepared && !scope.inTable) {
        // A positioned frame: the paragraphs after it wrap around the picture.
        parts.push({ render: () => this.floatingFrame(block, leaf, scope) });
        return;
      }
      switch (block.type) {
        case 'paragraph':
        case 'heading':
          parts.push({ render: (after) => this.paragraph(block, leaf, before, after, scope) });
          break;
        case 'code-block':
          parts.push({ render: (after) => this.code(block, leaf, before, after, scope) });
          break;
        case 'horizontal-rule':
          parts.push({
            render: (after) =>
              this.paragraphGroup(
                {
                  before,
                  after,
                  inTable: scope.inTable,
                  left: this.indent(leaf, scope),
                  borders: `\\brdrb\\brdrs\\brdrw${twips(DOCUMENT_STYLE.rule.width)}\\brdrcf${this.color(DOCUMENT_STYLE.borderColor)}`,
                  markSize: 2,
                },
                '',
              ),
          });
          break;
        case 'image':
          parts.push({ render: (after) => this.imageParagraph(block, leaf, before, after, scope) });
          break;
        case 'graphic':
          if (block.raster) {
            parts.push({ render: (after) => this.graphicParagraph(block, leaf, before, after, scope) });
          } else {
            this.warnings.add('graphic-layout-simplified');
            const fallback = this.flow(graphicToFallbackBlocks(block), container === 'cell' ? 'cell' : 'blockquote', scope);
            parts.push({ render: () => fallback.join('\n') });
          }
          break;
        case 'table': {
          if (scope.inTable) {
            // Tables inside table cells become text rows.
            this.warnings.add('table-layout-simplified');
            const rows = block.rows.map((row) =>
              row.cells.map((cell) => cellPlainText(cell.blocks)).join(' | '),
            );
            parts.push({
              render: (after) =>
                rows
                  .map((row, rowIndex) =>
                    this.paragraphGroup(
                      { before: rowIndex === 0 ? before : 0, after: rowIndex === rows.length - 1 ? after : 0, inTable: true },
                      this.run(row, textBaseStyleFor(scope)),
                    ),
                  )
                  .join('\n'),
            });
            break;
          }
          // Consecutive tables need a paragraph between them, or readers merge them.
          if (parts[parts.length - 1]?.table) {
            parts.push({ render: () => this.paragraphGroup({ before: 0, after: 0, inTable: false, line: -1, markSize: 2 }, '') });
          }
          const previous = parts[parts.length - 1];
          if (previous && !previous.table) {
            const render = previous.render;
            previous.render = (after) => render(Math.max(after, before));
          }
          parts.push({ render: () => this.table(block, leaf, scope), table: true });
          break;
        }
        default:
          break;
      }
    });
    return parts.map((part, index) => part.render(index === parts.length - 1 && container === 'cell' ? trailing : 0));
  }

  private indent(leaf: FlowLeaf, scope: { indent: number }): number {
    const list = leaf.listDepth * (DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding);
    const quote = leaf.quoteDepth * (DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft);
    return scope.indent + list + quote;
  }

  private available(leaf: FlowLeaf, scope: { indent: number }): number {
    return Math.max(48, this.geometry.contentWidthPx - this.indent(leaf, scope));
  }

  private paragraphProperties(options: ParagraphOptions): string {
    let properties = '\\pard\\plain';
    if (options.inTable) properties += '\\intbl';
    if (options.style) properties += `\\s${options.style}\\outlinelevel${options.style - 1}`;
    if (options.keepNext) properties += '\\keepn';
    if (options.list) properties += options.list;
    properties += `\\sb${twips(options.before)}\\sa${twips(options.after)}`;
    if (options.line) properties += `\\sl${options.line < 0 ? -twips(-options.line) : twips(options.line)}\\slmult0`;
    if (options.left) properties += `\\li${twips(options.left)}`;
    if (options.firstLine) properties += `\\fi${twips(options.firstLine)}`;
    if (options.right) properties += `\\ri${twips(options.right)}`;
    properties += options.align === 'center' ? '\\qc' : options.align === 'right' ? '\\qr' : options.align === 'justify' ? '\\qj' : '\\ql';
    if (options.borders) properties += options.borders;
    if (options.shading) properties += `\\cbpat${options.shading}`;
    return properties;
  }

  /** One paragraph; `content` is already RTF. Paragraphs in cells end with `\cell` where the flow ends. */
  private paragraphGroup(options: ParagraphOptions, content: string): string {
    const mark = options.markSize ? `\\fs${options.markSize}` : '';
    return `${this.paragraphProperties(options)}${mark} ${content}\\par`;
  }

  private context(block: ExportTextBlock, leaf: FlowLeaf, scope: FlowScope): TextContext {
    if (block.type === 'heading') return { kind: 'heading', level: block.level ?? 1, quote: leaf.quoteDepth > 0 };
    if (scope.cell) return { ...scope.cell.context, quote: leaf.quoteDepth > 0 };
    return { kind: 'body', quote: leaf.quoteDepth > 0 };
  }

  private paragraph(block: ExportTextBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const context = this.context(block, leaf, scope);
    const base = textBaseStyle(context);
    const runs = styledRuns({ runs: block.runs, context }, false);
    const left = this.indent(leaf, scope);
    const quote = leaf.quoteDepth > 0 && block.type !== 'heading';
    return this.paragraphGroup(
      {
        before,
        after,
        line: lineBoxPx(base, runs.map(({ style }) => style)),
        left,
        ...(leaf.listItem ? { firstLine: -18, list: this.listControls(leaf) } : {}),
        align: block.align ?? scope.cell?.align,
        ...(block.type === 'heading' ? { style: block.level ?? 1, keepNext: true } : {}),
        inTable: scope.inTable,
        ...(quote ? { borders: this.quoteBorder() } : {}),
      },
      `${leaf.listItem ? this.listText(leaf, base.sizePx) : ''}${this.runs(runs)}`,
    );
  }

  private quoteBorder(): string {
    const quote = DOCUMENT_STYLE.blockquote;
    return `\\brdrl\\brdrs\\brdrw${twips(quote.borderWidth)}\\brsp${twips(quote.paddingLeft)}\\brdrcf${this.color(DOCUMENT_STYLE.borderColor)}`;
  }

  private runs(runs: Array<{ text: string; style: RunStyle; run: ExportInlineRun }>): string {
    const out: string[] = [];
    let index = 0;
    while (index < runs.length) {
      const href = runs[index].run.link?.href;
      if (href && /^(https?:|mailto:)/i.test(href)) {
        const group: string[] = [];
        while (index < runs.length && runs[index].run.link?.href === href) {
          group.push(this.styledRun(runs[index].text, runs[index].style));
          index += 1;
        }
        const target = rtfText(href.replace(/"/g, '%22'));
        out.push(`{\\field{\\*\\fldinst{HYPERLINK "${target}"}}{\\fldrslt{${group.join('')}}}}`);
        continue;
      }
      out.push(this.styledRun(runs[index].text, runs[index].style));
      index += 1;
    }
    return out.join('');
  }

  private styledRun(text: string, style: RunStyle): string {
    if (!text) return '';
    let controls = `\\f${this.font(style.family)}`;
    // Super/subscript keep the surrounding size; readers shrink them.
    controls += `\\fs${halfPoints(style.superscript || style.subscript ? style.parentSizePx : style.sizePx)}`;
    controls += `\\cf${this.color(style.color)}`;
    if (style.weight >= 600) controls += '\\b';
    if (style.italic) controls += '\\i';
    if (style.underline) controls += '\\ul';
    if (style.strike) controls += '\\strike';
    if (style.superscript) controls += '\\super';
    else if (style.subscript) controls += '\\sub';
    if (style.highlight) controls += `\\chshdng0\\chcbpat${this.color(style.highlight)}`;
    return `{${controls} ${rtfText(text)}}`;
  }

  /** Plain run in a base style (generated text). */
  private run(text: string, base: { family: ResolvedFamily; sizePx: number; color: string; weight: number }): string {
    return `{\\f${this.font(base.family)}\\fs${halfPoints(base.sizePx)}\\cf${this.color(base.color)}${base.weight >= 600 ? '\\b' : ''} ${rtfText(text)}}`;
  }

  /** `\lsN\ilvlN` for the first paragraph of a list item. */
  private listControls(leaf: FlowLeaf): string {
    const item = leaf.listItem;
    if (!item) return '';
    const level = Math.min(8, item.depth - 1);
    return `\\ls${this.listFor(item.list, level, item.bulletDepth)}\\ilvl${level}`;
  }

  private listKind(list: ExportListBlock, bulletDepth: number): ListKind {
    if (list.ordered) return 'decimal';
    return bulletDepth <= 1 ? 'disc' : bulletDepth === 2 ? 'circle' : 'square';
  }

  /** One list definition per list, so each restarts at its own start number. */
  private listFor(list: ExportListBlock, level: number, bulletDepth: number): number {
    const existing = this.listIds.get(list);
    if (existing) return existing;
    const id = this.listIds.size + 1;
    this.listIds.set(list, id);
    const kind = this.listKind(list, bulletDepth);
    const muted = this.color(DOCUMENT_STYLE.mutedColor);
    const markerFont = kind === 'circle' || kind === 'square' ? this.font(resolveFamily('Arial')) : 0;
    const step = DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding;
    const levels = Array.from({ length: 9 }, (_, index) => {
      const text =
        kind === 'decimal'
          ? `{\\leveltext\\'02\\'0${index}.;}{\\levelnumbers\\'01;}`
          : `{\\leveltext\\'01\\u${BULLETS[kind]} ?;}{\\levelnumbers;}`;
      const start = index === level ? list.start : 1;
      return `{\\listlevel\\levelnfc${kind === 'decimal' ? 0 : 23}\\levelnfcn${kind === 'decimal' ? 0 : 23}\\leveljc0\\leveljcn0\\levelfollow0\\levelstartat${start}\\levelspace0\\levelindent0${text}\\f${markerFont}\\cf${muted}\\b0\\i0\\fi${-twips(18)}\\li${twips(step * (index + 1))}\\lin${twips(step * (index + 1))}}`;
    }).join('');
    this.lists.push(`{\\list\\listtemplateid${1000 + id}\\listhybrid${levels}{\\listname ;}\\listid${id}}`);
    this.listOverrides.push(`{\\listoverride\\listid${id}\\listoverridecount0\\ls${id}}`);
    return id;
  }

  /** Marker text for readers that ignore list tables. */
  private listText(leaf: FlowLeaf, sizePx: number): string {
    const item = leaf.listItem;
    if (!item) return '';
    const kind = this.listKind(item.list, item.bulletDepth);
    const marker = kind === 'decimal' ? `${item.list.start + item.index}.` : String.fromCodePoint(BULLETS[kind]);
    return `{\\listtext\\pard\\plain\\f0\\fs${halfPoints(sizePx)}\\cf${this.color(DOCUMENT_STYLE.mutedColor)} ${rtfText(marker)}\\tab}`;
  }

  private code(block: ExportCodeBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const style = DOCUMENT_STYLE.codeBlock;
    const base = textBaseStyle({ kind: 'code-block' });
    const background = this.color(style.background);
    // Padding above and below the lines is drawn with borders in the background color.
    const padding = `\\brdrt\\brdrs\\brdrw15\\brsp${twips(style.paddingY)}\\brdrcf${background}\\brdrb\\brdrs\\brdrw15\\brsp${twips(style.paddingY)}\\brdrcf${background}`;
    return this.paragraphGroup(
      {
        before: before + style.paddingY,
        after: after + style.paddingY,
        line: -style.lineHeightPx,
        left: this.indent(leaf, scope) + style.paddingX,
        right: style.paddingX,
        inTable: scope.inTable,
        borders: padding,
        shading: background,
      },
      `${this.run(block.text, { ...base, family: resolveFamily(MONOSPACE_FAMILY) })}`,
    );
  }

  private picture(image: PreparedExportImage, widthPx: number, heightPx: number, description: string): string {
    const blip = image.mimeType === 'image/png' ? '\\pngblip' : '\\jpegblip';
    const hex = bytesToHex(image.bytes).replace(/(.{128})/g, '$1\n');
    const properties = `{\\*\\picprop{\\sp{\\sn wzDescription}{\\sv ${rtfText(description)}}}}`;
    return `{\\pict${properties}${blip}\\picw${image.width}\\pich${image.height}\\picwgoal${twips(widthPx)}\\pichgoal${twips(heightPx)}\n${hex}}`;
  }

  private imageSize(image: ExportImageBlock, prepared: PreparedExportImage, available: number): { width: number; height: number } {
    let width = image.widthPercent ? (available * image.widthPercent) / 100 : Math.min(prepared.width, available);
    width = Math.min(width, available);
    return { width, height: (width / prepared.width) * prepared.height };
  }

  private imageParagraph(image: ExportImageBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const left = this.indent(leaf, scope);
    if (!image.prepared) {
      const context: TextContext = scope.cell?.context ?? { kind: 'body' };
      const runs = styledRuns({ runs: imagePlaceholderRuns(image), context }, false);
      return this.paragraphGroup({ before, after, left, align: 'center', inTable: scope.inTable }, `${this.runs(runs)}`);
    }
    const { width, height } = this.imageSize(image, image.prepared, this.available(leaf, scope));
    return this.paragraphGroup(
      {
        before,
        after,
        left,
        // Floats inside table cells (no frames there) keep their side.
        align: image.float ?? 'center',
        inTable: scope.inTable,
        ...(leaf.listItem ? { firstLine: -18, list: this.listControls(leaf) } : {}),
      },
      `${this.picture(image.prepared, width, height, image.alt || imageLabel(image))}`,
    );
  }

  /**
   * A positioned frame holding the picture, before the paragraph it floats
   * beside; text wraps around it like the editor's floats. (Picture shapes
   * would also work in Word, but LibreOffice reserves phantom wrap areas
   * for them at the top of the document.)
   */
  private floatingFrame(image: ExportImageBlock, leaf: FlowLeaf, scope: FlowScope): string {
    const prepared = image.prepared as PreparedExportImage;
    const available = this.available(leaf, scope);
    const { width, height } = this.imageSize(image, prepared, available);
    const indent = this.indent(leaf, scope);
    const x = image.float === 'right' ? indent + available - width : indent;
    const frame = `\\pard\\plain\\phmrg\\posx${twips(x)}\\pvpara\\posy${twips(DOCUMENT_STYLE.image.floatMargin)}\\absw${twips(width)}\\dxfrtext${twips(DOCUMENT_STYLE.image.floatGap)}\\dfrmtxtx${twips(DOCUMENT_STYLE.image.floatGap)}\\dfrmtxty${twips(DOCUMENT_STYLE.image.floatMargin)}\\wraparound\\sb0\\sa0`;
    return `${frame} ${this.picture(prepared, width, height, image.alt || imageLabel(image))}\\par`;
  }

  private graphicParagraph(graphic: ExportGraphicBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const raster = graphic.raster as PreparedExportImage;
    const width = this.available(leaf, scope);
    const height = (width * raster.height) / raster.width;
    return this.paragraphGroup(
      {
        before,
        after,
        left: this.indent(leaf, scope),
        align: 'center',
        inTable: scope.inTable,
        ...(leaf.listItem ? { firstLine: -18, list: this.listControls(leaf) } : {}),
      },
      `${this.picture(raster, width, height, graphicAltText(graphic))}`,
    );
  }

  private table(table: ExportTableBlock, leaf: FlowLeaf, scope: FlowScope): string {
    const style = DOCUMENT_STYLE.table;
    const grid = buildTableGrid(table);
    const available = this.available(leaf, scope);
    const widths = resolveColumnWidths(table, grid.columnCount, available, style.minColumnWidth);
    const total = widths.reduce((sum, width) => sum + width, 0);
    const left = twips(this.indent(leaf, scope));
    const borderColor = this.color(DOCUMENT_STYLE.borderColor);
    const border =
      table.borders === 'hidden'
        ? ['t', 'l', 'b', 'r'].map((side) => `\\clbrdr${side}\\brdrnone`).join('')
        : ['t', 'l', 'b', 'r'].map((side) => `\\clbrdr${side}\\brdrs\\brdrw${twips(style.borderWidth)}\\brdrcf${borderColor}`).join('');
    const padX = twips(style.cellPaddingX);
    const padY = twips(style.cellPaddingY);
    const headerRows = grid.slots.findIndex((slots) => !slots.every((entry) => entry?.cell.header));
    const edges: number[] = [];
    widths.reduce((sum, width, index) => (edges[index] = sum + width), 0);

    return grid.slots
      .map((slots, rowIndex) => {
        let definition = `\\trowd\\trgaph${padX}\\trleft${left}\\trftsWidth3\\trwWidth${twips(total)}\\trpaddl${padX}\\trpaddr${padX}\\trpaddt${padY}\\trpaddb${padY}\\trpaddfl3\\trpaddfr3\\trpaddft3\\trpaddfb3`;
        if (headerRows > 0 && rowIndex < headerRows) definition += '\\trhdr';
        const cells: string[] = [];
        for (let column = 0; column < grid.columnCount; ) {
          const entry = slots[column];
          if (!entry || entry.column !== column) {
            // A slot no cell reaches (ragged row): an empty cell keeps the grid.
            definition += `${border}\\clftsWidth3\\clwWidth${twips(widths[column])}\\cellx${left + twips(edges[column])}`;
            cells.push('\\pard\\plain\\intbl\\cell');
            column += 1;
            continue;
          }
          const fill = toHex(entry.cell.backgroundColor) ?? (entry.cell.header ? style.headerBackground : style.cellBackground);
          const last = column + entry.colSpan - 1;
          const width = widths.slice(column, last + 1).reduce((sum, value) => sum + value, 0);
          const merge = entry.rowSpan > 1 ? (entry.row === rowIndex ? '\\clvmgf' : '\\clvmrg') : '';
          definition += `${merge}\\clvertalt${border}\\clcbpat${this.color(fill)}\\clftsWidth3\\clwWidth${twips(width)}\\cellx${left + twips(edges[last])}`;
          if (entry.row !== rowIndex) {
            cells.push('\\pard\\plain\\intbl\\cell');
          } else {
            const context: TextContext = {
              kind: 'cell',
              header: entry.cell.header,
              ...(entry.cell.color ? { color: entry.cell.color } : {}),
            };
            const content = this.flow(entry.cell.blocks, 'cell', {
              indent: 0,
              inTable: true,
              cell: { context, ...(entry.cell.align ? { align: entry.cell.align } : {}) },
            }).join('\n');
            cells.push(content ? content.replace(/\\par$/, '\\cell') : '\\pard\\plain\\intbl\\cell');
          }
          column = last + 1;
        }
        return `${definition}\n${cells.join('\n')}\n\\row`;
      })
      .join('\n');
  }
}

function textBaseStyleFor(scope: FlowScope) {
  return textBaseStyle(scope.cell?.context ?? { kind: 'body' });
}

function cellPlainText(blocks: ExportBlock[]): string {
  const parts: string[] = [];
  walkBlocks(blocks, (block) => {
    if (block.type === 'paragraph' || block.type === 'heading') parts.push(getVisibleTextFromRuns(block.runs, true));
    else if (block.type === 'image') parts.push(getVisibleTextFromRuns(imagePlaceholderRuns(block), true));
    else if (block.type === 'code-block') parts.push(block.text);
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
