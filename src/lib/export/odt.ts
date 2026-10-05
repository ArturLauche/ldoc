import { toHex } from './color';
import {
  DEFAULT_DOCUMENT_FAMILY,
  MONOSPACE_FAMILY,
  isMonospaceFamily,
  officeFontClass,
  resolveFamily,
  type ResolvedFamily,
} from './fonts/catalog';
import { odfFaces } from './fonts/embedding';
import { ExportFontRegistry } from './fonts/registry';
import { noteGraphicFonts, prepareGraphicRenditions } from './graphics/renditions';
import {
  buildTableGrid,
  escapeXml,
  escapeXmlAttr,
  graphicAltText,
  graphicToFallbackBlocks,
  imageLabel,
  imagePlaceholderRuns,
  languageTag,
  resolveColumnWidths,
} from './shared';
import { noteDocumentFonts, styledRuns } from './textUsage';
import {
  DOCUMENT_STYLE,
  PX_TO_PT,
  flowLeaves,
  lineBoxPx,
  pageGeometry,
  resolveRunStyle,
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
 * ODT (ODF 1.3): named styles mirroring the editor (headings with outline
 * levels, quotations, table text, preformatted text), automatic styles for
 * direct formatting, native nested lists, tables with merged cells, shading
 * and column widths, floating and inline pictures, Smart Graphics as SVG with
 * a PNG fallback, hyperlinks, page geometry and metadata. The fonts the text
 * uses are embedded at every weight it uses, so LibreOffice shows them as in
 * the editor without installing anything.
 */
export async function renderOdt(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  const registry = new ExportFontRegistry(warnings);
  noteDocumentFonts(registry, documentModel.blocks, { generated: false, graphicFallbacks: false });
  noteGraphicFonts(registry, documentModel);
  await registry.load({ instances: true, fallback: false });
  await prepareGraphicRenditions(documentModel, registry, warnings);

  const geometry = pageGeometry(documentModel.locale);
  const writer = new OdtWriter(geometry, warnings);
  const body = writer.flow(documentModel.blocks, 'root', { indent: 0 });

  // Embedded fonts: every weight of every self-hosted family the text uses.
  const fontFiles: Array<{ path: string; bytes: Uint8Array; family: string }> = [];
  odfFaces(registry).forEach((face, index) => {
    const slug = `${face.familyName}-${face.styleName}`.replace(/[^A-Za-z0-9-]+/g, '');
    fontFiles.push({ path: `Fonts/${slug || 'font'}-${index + 1}.ttf`, bytes: face.bytes, family: face.family });
  });
  writer.useFamily(resolveFamily(DEFAULT_DOCUMENT_FAMILY));
  const fontDecls = writer.fontFaceDecls(fontFiles);
  const language = languageTag(documentModel.locale);

  const JSZip = await import('jszip').then((module) => module.default);
  const zip = new JSZip();
  // The mimetype entry must come first and be stored uncompressed.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', writer.contentXml(body, fontDecls));
  zip.file('styles.xml', writer.stylesXml(fontDecls, language));
  zip.file('meta.xml', metaXml(documentModel.name, language));
  zip.file('settings.xml', settingsXml(fontFiles.length > 0));
  zip.file('META-INF/manifest.xml', manifestXml(writer.media, fontFiles));
  writer.media.forEach((entry) => zip.file(entry.path, entry.bytes, entry.mimeType === 'image/svg+xml' ? {} : { compression: 'STORE' }));
  fontFiles.forEach((file) => zip.file(file.path, file.bytes));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.oasis.opendocument.text',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ');

/** CSS px → points, as an ODF length. */
const pt = (px: number) => `${Math.round(px * PX_TO_PT * 100) / 100}pt`;

const BULLETS = { disc: '•', circle: '◦', square: '▪' } as const;
type ListKind = 'decimal' | keyof typeof BULLETS;
const LIST_STEP = DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding;
const LIST_HANGING = 18;

interface FlowScope {
  indent: number;
  cell?: { context: TextContext; align?: ExportAlignment };
}

interface ParagraphProperties {
  parent: string;
  before: number;
  after: number;
  /** CSS line box (px, at least); negative = exact. */
  line?: number;
  left?: number;
  right?: number;
  textIndent?: number;
  align?: ExportAlignment;
  keepNext?: boolean;
  list?: boolean;
}

/** Encodes text for ODF, where runs of spaces, tabs and line breaks need elements. */
class OdfTextEncoder {
  private previousSpace = true;

  encode(text: string): string {
    let out = '';
    let spaces = 0;
    const flush = () => {
      if (spaces) out += spaces === 1 ? '<text:s/>' : `<text:s text:c="${spaces}"/>`;
      spaces = 0;
    };
    for (const char of text) {
      if (char === ' ') {
        if (this.previousSpace) spaces += 1;
        else {
          out += ' ';
          this.previousSpace = true;
        }
        continue;
      }
      flush();
      if (char === '\n') {
        out += '<text:line-break/>';
        this.previousSpace = true;
      } else if (char === '\t') {
        out += '<text:tab/>';
        this.previousSpace = true;
      } else {
        out += escapeXml(char);
        this.previousSpace = false;
      }
    }
    flush();
    return out;
  }
}

class OdtWriter {
  readonly media: Array<{ path: string; bytes: Uint8Array; mimeType: string }> = [];
  private readonly mediaPaths = new Map<object, string>();
  private readonly families = new Map<string, ResolvedFamily>();
  private readonly styles = new Map<string, string>();
  private readonly styleXml: string[] = [];
  private readonly counters = new Map<string, number>();
  private pendingFloats: string[] = [];
  private nextFrame = 1;
  private nextTable = 1;

  constructor(
    private readonly geometry: PageGeometry,
    private readonly warnings: WarningCollector,
  ) {}

  useFamily(family: ResolvedFamily): string {
    this.families.set(family.name, family);
    return family.name;
  }

  /** Automatic style, deduplicated by its properties. */
  private style(family: string, prefix: string, body: string, attributes = ''): string {
    const key = `${family}|${attributes}|${body}`;
    let name = this.styles.get(key);
    if (!name) {
      const next = (this.counters.get(prefix) ?? 0) + 1;
      this.counters.set(prefix, next);
      name = `${prefix}${next}`;
      this.styles.set(key, name);
      this.styleXml.push(`<style:style style:name="${name}" style:family="${family}"${attributes}>${body}</style:style>`);
    }
    return name;
  }

  private paragraphStyle(properties: ParagraphProperties, extra = ''): string {
    const attributes: string[] = [`fo:margin-top="${pt(properties.before)}"`, `fo:margin-bottom="${pt(properties.after)}"`];
    if (properties.line !== undefined) {
      attributes.push(properties.line < 0 ? `fo:line-height="${pt(-properties.line)}"` : `style:line-height-at-least="${pt(properties.line)}"`);
    }
    if (properties.left !== undefined) attributes.push(`fo:margin-left="${pt(properties.left)}"`);
    if (properties.right !== undefined) attributes.push(`fo:margin-right="${pt(properties.right)}"`);
    if (properties.textIndent !== undefined) attributes.push(`fo:text-indent="${pt(properties.textIndent)}"`);
    if (properties.align) {
      const align = properties.align === 'left' ? 'start' : properties.align === 'right' ? 'end' : properties.align;
      attributes.push(`fo:text-align="${align}"`);
      if (align === 'justify') attributes.push('fo:text-align-last="start"');
    }
    if (properties.keepNext) attributes.push('fo:keep-with-next="always"');
    return this.style(
      'paragraph',
      'P',
      `<style:paragraph-properties ${attributes.join(' ')}${extra}/>`,
      ` style:parent-style-name="${properties.parent}"`,
    );
  }

  private textStyle(style: RunStyle): string {
    const font = escapeXmlAttr(this.useFamily(style.family));
    const size = pt(style.superscript || style.subscript ? style.parentSizePx : style.sizePx);
    const weight = style.weight === 400 ? 'normal' : style.weight === 700 ? 'bold' : String(style.weight);
    const attributes = [
      `style:font-name="${font}"`,
      `style:font-name-asian="${font}"`,
      `style:font-name-complex="${font}"`,
      `fo:font-size="${size}"`,
      `style:font-size-asian="${size}"`,
      `style:font-size-complex="${size}"`,
      `fo:font-weight="${weight}"`,
      `style:font-weight-asian="${weight}"`,
      `style:font-weight-complex="${weight}"`,
      `fo:font-style="${style.italic ? 'italic' : 'normal'}"`,
      `style:font-style-asian="${style.italic ? 'italic' : 'normal'}"`,
      `style:font-style-complex="${style.italic ? 'italic' : 'normal'}"`,
      `fo:color="#${style.color}"`,
    ];
    if (style.highlight) attributes.push(`fo:background-color="#${style.highlight}"`);
    if (style.underline) attributes.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (style.strike) attributes.push('style:text-line-through-style="solid" style:text-line-through-type="single"');
    if (style.superscript) attributes.push('style:text-position="super 75%"');
    else if (style.subscript) attributes.push('style:text-position="sub 75%"');
    return this.style('text', 'T', `<style:text-properties ${attributes.join(' ')}/>`);
  }

  private mediaPath(key: object, bytes: Uint8Array, mimeType: string, extension: string): string {
    let path = this.mediaPaths.get(key);
    if (!path) {
      path = `Pictures/image${this.media.length + 1}.${extension}`;
      this.media.push({ path, bytes, mimeType });
      this.mediaPaths.set(key, path);
    }
    return path;
  }

  /** Renders the blocks of one flow (the page, or a table cell). */
  flow(blocks: ExportBlock[], container: MarginContext['container'], scope: FlowScope): string {
    const { leaves, trailing } = flowLeaves(blocks, container);
    const byBlock = new Map<ExportBlock, { leaf: FlowLeaf; before: number; after: number }>();
    leaves.forEach((leaf, index) => {
      byBlock.set(leaf.block, {
        leaf,
        before: container === 'root' && index === 0 ? 0 : leaf.spaceBefore,
        after: index === leaves.length - 1 && container === 'cell' ? trailing : 0,
      });
    });
    const xml = this.blocks(blocks, byBlock, scope, 0);
    if (!this.pendingFloats.length) return xml;
    const floats = this.pendingFloats.join('');
    this.pendingFloats = [];
    return `${xml}<text:p text:style-name="${this.paragraphStyle({ parent: 'Standard', before: 0, after: 0 })}">${floats}</text:p>`;
  }

  private blocks(
    blocks: ExportBlock[],
    byBlock: Map<ExportBlock, { leaf: FlowLeaf; before: number; after: number }>,
    scope: FlowScope,
    listLevel: number,
  ): string {
    return blocks
      .map((block) => {
        if (block.type === 'list') return this.list(block, byBlock, scope, listLevel);
        if (block.type === 'blockquote') return this.blocks(block.blocks, byBlock, scope, listLevel);
        const placed = byBlock.get(block);
        if (!placed) return '';
        const { leaf, before, after } = placed;
        switch (block.type) {
          case 'paragraph':
          case 'heading':
            return this.paragraph(block, leaf, before, after, scope);
          case 'code-block':
            return this.code(block, leaf, before, after, scope);
          case 'horizontal-rule':
            return this.rule(leaf, before, after, scope);
          case 'image':
            if (block.float && block.prepared) {
              this.pendingFloats.push(this.frame(block, leaf, scope, true));
              return '';
            }
            return this.imageParagraph(block, leaf, before, after, scope);
          case 'graphic':
            if (block.raster && block.svg) return this.graphicParagraph(block, leaf, before, after, scope);
            this.warnings.add('graphic-layout-simplified');
            return this.flow(graphicToFallbackBlocks(block), scope.cell ? 'cell' : 'blockquote', scope);
          case 'table':
            return this.table(block, leaf, before, scope);
          default:
            return '';
        }
      })
      .join('');
  }

  private listKind(list: ExportListBlock, bulletDepth: number): ListKind {
    if (list.ordered) return 'decimal';
    return bulletDepth <= 1 ? 'disc' : bulletDepth === 2 ? 'circle' : 'square';
  }

  private list(
    list: ExportListBlock,
    byBlock: Map<ExportBlock, { leaf: FlowLeaf; before: number; after: number }>,
    scope: FlowScope,
    listLevel: number,
  ): string {
    let bulletDepth = 1;
    for (const item of list.items) {
      const first = item.blocks.map((block) => byBlock.get(block)?.leaf).find(Boolean);
      if (first?.listItem) {
        bulletDepth = first.listItem.bulletDepth;
        break;
      }
    }
    const kind = this.listKind(list, bulletDepth);
    const items = list.items
      .map((item, index) => {
        const start = index === 0 && list.ordered && list.start !== 1 ? ` text:start-value="${list.start}"` : '';
        const content = this.blocks(item.blocks, byBlock, scope, listLevel + 1);
        const empty = `<text:p text:style-name="${this.paragraphStyle({ parent: 'Standard', before: 0, after: 0 })}"/>`;
        return `<text:list-item${start}>${content || empty}</text:list-item>`;
      })
      .join('');
    return `<text:list text:style-name="LWrite_${kind}">${items}</text:list>`;
  }

  private indent(leaf: FlowLeaf, scope: { indent: number }): number {
    const list = leaf.listDepth * LIST_STEP;
    const quote = leaf.quoteDepth * (DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft);
    return scope.indent + list + quote;
  }

  private available(leaf: FlowLeaf, scope: { indent: number }): number {
    return Math.max(48, this.geometry.contentWidthPx - this.indent(leaf, scope));
  }

  private context(block: ExportTextBlock, leaf: FlowLeaf, scope: FlowScope): TextContext {
    if (block.type === 'heading') return { kind: 'heading', level: block.level ?? 1, quote: leaf.quoteDepth > 0 };
    if (scope.cell) return { ...scope.cell.context, quote: leaf.quoteDepth > 0 };
    return { kind: 'body', quote: leaf.quoteDepth > 0 };
  }

  private parentStyle(block: ExportTextBlock, leaf: FlowLeaf, scope: FlowScope): string {
    if (block.type === 'heading') return `Heading_20_${block.level ?? 1}`;
    if (scope.cell) return scope.cell.context.header ? 'Table_20_Heading' : 'Table_20_Contents';
    if (leaf.quoteDepth > 0) return 'Quotations';
    return 'Standard';
  }

  /** Margins inside lists and quotes: list paragraphs hang their label. */
  private margins(leaf: FlowLeaf, scope: FlowScope): Pick<ParagraphProperties, 'left' | 'textIndent' | 'list'> {
    const indent = this.indent(leaf, scope);
    // Quotations put the bar at the paragraph's left margin, the text after the padding.
    const quote = leaf.quoteDepth > 0 ? DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft : 0;
    if (leaf.listDepth === 0 && !indent) return {};
    return {
      left: indent - quote,
      ...(leaf.listItem ? { textIndent: -LIST_HANGING, list: true } : {}),
    };
  }

  private takeFloats(): string {
    const floats = this.pendingFloats.join('');
    this.pendingFloats = [];
    return floats;
  }

  private paragraph(block: ExportTextBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const context = this.context(block, leaf, scope);
    const base = textBaseStyle(context);
    const runs = styledRuns({ runs: block.runs, context }, false);
    const line = lineBoxPx(base, runs.map(({ style }) => style));
    const parent = this.parentStyle(block, leaf, scope);
    const name = this.paragraphStyle({
      parent,
      before,
      after,
      ...(Math.abs(line - base.sizePx * base.lineHeight) > 0.01 ? { line } : {}),
      ...this.margins(leaf, scope),
      align: block.align ?? scope.cell?.align,
      ...(block.type === 'heading' ? { keepNext: true } : {}),
    });
    const content = `${this.takeFloats()}${this.runs(runs)}`;
    if (block.type === 'heading') {
      return `<text:h text:style-name="${name}" text:outline-level="${block.level ?? 1}">${content}</text:h>`;
    }
    return `<text:p text:style-name="${name}">${content}</text:p>`;
  }

  private runs(runs: Array<{ text: string; style: RunStyle; run: ExportInlineRun }>): string {
    const encoder = new OdfTextEncoder();
    const out: string[] = [];
    let index = 0;
    const span = (text: string, style: RunStyle) => (text ? `<text:span text:style-name="${this.textStyle(style)}">${encoder.encode(text)}</text:span>` : '');
    while (index < runs.length) {
      const href = runs[index].run.link?.href;
      if (href && /^(https?:|mailto:)/i.test(href)) {
        const group: string[] = [];
        while (index < runs.length && runs[index].run.link?.href === href) {
          group.push(span(runs[index].text, runs[index].style));
          index += 1;
        }
        out.push(
          `<text:a xlink:type="simple" xlink:href="${escapeXmlAttr(href)}" text:style-name="Internet_20_link" text:visited-style-name="Internet_20_link">${group.join('')}</text:a>`,
        );
        continue;
      }
      out.push(span(runs[index].text, runs[index].style));
      index += 1;
    }
    return out.join('');
  }

  private code(block: ExportCodeBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const name = this.paragraphStyle({
      parent: 'Preformatted_20_Text',
      before,
      after,
      left: this.indent(leaf, scope),
    });
    const style = resolveRunStyle({}, undefined, textBaseStyle({ kind: 'code-block' }));
    const text = new OdfTextEncoder().encode(block.text);
    return `<text:p text:style-name="${name}">${this.takeFloats()}<text:span text:style-name="${this.textStyle(style)}">${text}</text:span></text:p>`;
  }

  private rule(leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const name = this.paragraphStyle({ parent: 'Horizontal_20_Line', before, after, left: this.indent(leaf, scope) });
    return `<text:p text:style-name="${name}">${this.takeFloats()}</text:p>`;
  }

  private imageSize(image: ExportImageBlock, prepared: PreparedExportImage, available: number): { width: number; height: number } {
    let width = image.widthPercent ? (available * image.widthPercent) / 100 : Math.min(prepared.width, available);
    width = Math.min(width, available);
    return { width, height: (width / prepared.width) * prepared.height };
  }

  private frame(image: ExportImageBlock, leaf: FlowLeaf, scope: FlowScope, floating: boolean): string {
    const prepared = image.prepared as PreparedExportImage;
    const { width, height } = this.imageSize(image, prepared, this.available(leaf, scope));
    const path = this.mediaPath(prepared, prepared.bytes, prepared.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', prepared.extension === 'png' ? 'png' : 'jpg');
    const image_ = `<draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="${prepared.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'}"/>`;
    return this.frameXml(image_, width, height, image.alt || imageLabel(image), floating ? image.float : undefined);
  }

  private frameXml(content: string, width: number, height: number, description: string, float?: 'left' | 'right'): string {
    const id = this.nextFrame;
    this.nextFrame += 1;
    const gap = pt(DOCUMENT_STYLE.image.floatGap);
    const vertical = pt(DOCUMENT_STYLE.image.floatMargin);
    const style = float
      ? this.style(
          'graphic',
          'fr',
          `<style:graphic-properties style:wrap="${float === 'left' ? 'right' : 'left'}" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false" style:horizontal-pos="${float}" style:horizontal-rel="paragraph" style:vertical-pos="top" style:vertical-rel="paragraph" fo:margin-left="${float === 'right' ? gap : '0pt'}" fo:margin-right="${float === 'left' ? gap : '0pt'}" fo:margin-top="${vertical}" fo:margin-bottom="${vertical}" fo:border="none" style:mirror="none" fo:clip="rect(0pt, 0pt, 0pt, 0pt)" draw:luminance="0%" draw:contrast="0%" draw:red="0%" draw:green="0%" draw:blue="0%" draw:gamma="100%" draw:color-inversion="false" draw:image-opacity="100%" draw:color-mode="standard"/>`,
          ' style:parent-style-name="Graphics"',
        )
      : this.style(
          'graphic',
          'fr',
          '<style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" fo:border="none" style:mirror="none"/>',
          ' style:parent-style-name="Graphics"',
        );
    const anchor = float ? 'paragraph' : 'as-char';
    return `<draw:frame draw:style-name="${style}" draw:name="Picture ${id}" text:anchor-type="${anchor}" svg:width="${pt(width)}" svg:height="${pt(height)}" draw:z-index="${id}">${content}<svg:title>${escapeXml(description)}</svg:title><svg:desc>${escapeXml(description)}</svg:desc></draw:frame>`;
  }

  private imageParagraph(image: ExportImageBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const margins = this.margins(leaf, scope);
    if (!image.prepared) {
      const context: TextContext = scope.cell?.context ?? { kind: 'body' };
      const runs = styledRuns({ runs: imagePlaceholderRuns(image), context }, false);
      const name = this.paragraphStyle({ parent: scope.cell ? 'Table_20_Contents' : 'Standard', before, after, ...margins, align: 'center' });
      return `<text:p text:style-name="${name}">${this.takeFloats()}${this.runs(runs)}</text:p>`;
    }
    const name = this.paragraphStyle({ parent: 'Picture_20_Paragraph', before, after, ...margins, align: 'center' });
    return `<text:p text:style-name="${name}">${this.takeFloats()}${this.frame(image, leaf, scope, false)}</text:p>`;
  }

  private graphicParagraph(graphic: ExportGraphicBlock, leaf: FlowLeaf, before: number, after: number, scope: FlowScope): string {
    const raster = graphic.raster as PreparedExportImage;
    const svg = graphic.svg as Uint8Array;
    const width = this.available(leaf, scope);
    const height = (width * raster.height) / raster.width;
    const svgPath = this.mediaPath(svg, svg, 'image/svg+xml', 'svg');
    const pngPath = this.mediaPath(raster, raster.bytes, 'image/png', 'png');
    const images = `<draw:image xlink:href="${svgPath}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/svg+xml"/><draw:image xlink:href="${pngPath}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad" draw:mime-type="image/png"/>`;
    const name = this.paragraphStyle({ parent: 'Picture_20_Paragraph', before, after, ...this.margins(leaf, scope), align: 'center' });
    return `<text:p text:style-name="${name}">${this.takeFloats()}${this.frameXml(images, width, height, graphicAltText(graphic))}</text:p>`;
  }

  private table(table: ExportTableBlock, leaf: FlowLeaf, before: number, scope: FlowScope): string {
    const style = DOCUMENT_STYLE.table;
    const grid = buildTableGrid(table);
    const available = this.available(leaf, scope);
    const widths = resolveColumnWidths(table, grid.columnCount, available, style.minColumnWidth);
    const total = widths.reduce((sum, width) => sum + width, 0);
    const id = this.nextTable;
    this.nextTable += 1;
    const tableStyle = this.style(
      'table',
      'Ta',
      `<style:table-properties style:width="${pt(total)}" fo:margin-left="${pt(this.indent(leaf, scope))}" fo:margin-top="${pt(before)}" fo:margin-bottom="0pt" table:align="left" style:may-break-between-rows="true"/>`,
    );
    const columns = widths
      .map((width) => `<table:table-column table:style-name="${this.style('table-column', 'Tc', `<style:table-column-properties style:column-width="${pt(width)}"/>`)}"/>`)
      .join('');
    const border = table.borders === 'hidden' ? 'none' : `${pt(style.borderWidth)} solid #${DOCUMENT_STYLE.borderColor}`;
    const headerRows = grid.slots.findIndex((slots) => !slots.every((entry) => entry?.cell.header));
    // Floats waiting for a paragraph do not enter the table.
    const floats = this.takeFloats();
    const rows = grid.slots.map((slots, rowIndex) => {
      const cells: string[] = [];
      for (let column = 0; column < grid.columnCount; column += 1) {
        const entry = slots[column];
        if (!entry) {
          cells.push(`<table:table-cell table:style-name="${this.cellStyle(style.cellBackground, border)}" office:value-type="string"><text:p/></table:table-cell>`);
          continue;
        }
        if (entry.row !== rowIndex || entry.column !== column) {
          cells.push('<table:covered-table-cell/>');
          continue;
        }
        const fill = toHex(entry.cell.backgroundColor) ?? (entry.cell.header ? style.headerBackground : style.cellBackground);
        const spans = `${entry.colSpan > 1 ? ` table:number-columns-spanned="${entry.colSpan}"` : ''}${entry.rowSpan > 1 ? ` table:number-rows-spanned="${entry.rowSpan}"` : ''}`;
        const context: TextContext = {
          kind: 'cell',
          header: entry.cell.header,
          ...(entry.cell.color ? { color: entry.cell.color } : {}),
        };
        const content = this.flow(entry.cell.blocks, 'cell', {
          indent: 0,
          cell: { context, ...(entry.cell.align ? { align: entry.cell.align } : {}) },
        });
        cells.push(
          `<table:table-cell table:style-name="${this.cellStyle(fill, border)}" office:value-type="string"${spans}>${content || '<text:p/>'}</table:table-cell>`,
        );
      }
      return `<table:table-row>${cells.join('')}</table:table-row>`;
    });
    const header = headerRows > 0 ? `<table:table-header-rows>${rows.slice(0, headerRows).join('')}</table:table-header-rows>` : '';
    const body = rows.slice(headerRows > 0 ? headerRows : 0).join('');
    const floatParagraph = floats
      ? `<text:p text:style-name="${this.paragraphStyle({ parent: 'Standard', before: 0, after: 0 })}">${floats}</text:p>`
      : '';
    return `${floatParagraph}<table:table table:name="Table${id}" table:style-name="${tableStyle}">${columns}${header}${body}</table:table>`;
  }

  private cellStyle(fill: string, border: string): string {
    const style = DOCUMENT_STYLE.table;
    return this.style(
      'table-cell',
      'Tx',
      `<style:table-cell-properties fo:background-color="#${fill}" fo:padding-top="${pt(style.cellPaddingY)}" fo:padding-bottom="${pt(style.cellPaddingY)}" fo:padding-left="${pt(style.cellPaddingX)}" fo:padding-right="${pt(style.cellPaddingX)}" fo:border="${border}" style:vertical-align="top"/>`,
    );
  }

  fontFaceDecls(fontFiles: Array<{ path: string; family: string }>): string {
    const faces = Array.from(this.families.values()).map((family) => {
      const files = fontFiles.filter((file) => file.family === family.name);
      const source = files.length
        ? `<svg:font-face-src>${files
            .map((file) => `<svg:font-face-uri xlink:href="${file.path}" xlink:type="simple"><svg:font-face-format svg:string="truetype"/></svg:font-face-uri>`)
            .join('')}</svg:font-face-src>`
        : '';
      const generic = officeFontClass(family);
      const name = escapeXmlAttr(family.name);
      return `<style:font-face style:name="${name}" svg:font-family="'${name.replace(/'/g, '')}'" style:font-family-generic="${generic === 'decorative' ? 'decorative' : generic}" style:font-pitch="${isMonospaceFamily(family) ? 'fixed' : 'variable'}">${source}</style:font-face>`;
    });
    return `<office:font-face-decls>${faces.join('')}</office:font-face-decls>`;
  }

  contentXml(body: string, fontDecls: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">${fontDecls}<office:automatic-styles>${this.styleXml.join('')}</office:automatic-styles><office:body><office:text>${body || '<text:p text:style-name="Standard"/>'}</office:text></office:body></office:document-content>`;
  }

  stylesXml(fontDecls: string, language: string): string {
    const s = DOCUMENT_STYLE;
    const [lang, country] = language.split('-');
    const locale = `fo:language="${escapeXmlAttr(lang)}"${country ? ` fo:country="${escapeXmlAttr(country)}"` : ''}`;
    const family = escapeXmlAttr(DEFAULT_DOCUMENT_FAMILY);
    const mono = escapeXmlAttr(this.useFamily(resolveFamily(MONOSPACE_FAMILY)));
    const textProperties = (options: { font?: string; sizePx?: number; weight?: string; italic?: boolean; color?: string }) => {
      const parts: string[] = [];
      if (options.font) parts.push(`style:font-name="${options.font}" style:font-name-asian="${options.font}" style:font-name-complex="${options.font}"`);
      if (options.sizePx) parts.push(`fo:font-size="${pt(options.sizePx)}" style:font-size-asian="${pt(options.sizePx)}" style:font-size-complex="${pt(options.sizePx)}"`);
      if (options.weight) parts.push(`fo:font-weight="${options.weight}" style:font-weight-asian="${options.weight}" style:font-weight-complex="${options.weight}"`);
      if (options.italic) parts.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
      if (options.color) parts.push(`fo:color="#${options.color}"`);
      return `<style:text-properties ${parts.join(' ')}/>`;
    };
    const heading = (level: 1 | 2 | 3) => {
      const spec = s.headings[level];
      return `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="${level}" style:class="text"><style:paragraph-properties fo:margin-top="${pt(spec.marginTop)}" fo:margin-bottom="0pt" style:line-height-at-least="${pt(spec.sizePx * spec.lineHeight)}" fo:keep-with-next="always"/>${textProperties({ sizePx: spec.sizePx, weight: spec.weight === 700 ? 'bold' : String(spec.weight) })}</style:style>`;
    };
    const listLevels = (kind: ListKind) =>
      Array.from({ length: 10 }, (_, index) => {
        const level = index + 1;
        const position = `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${pt(LIST_STEP * level)}" fo:text-indent="${pt(-LIST_HANGING)}" fo:margin-left="${pt(LIST_STEP * level)}"/></style:list-level-properties>`;
        if (kind === 'decimal') {
          return `<text:list-level-style-number text:level="${level}" text:style-name="List_20_Marker" style:num-suffix="." style:num-format="1">${position}</text:list-level-style-number>`;
        }
        const font = kind === 'disc' ? '' : '<style:text-properties fo:font-family="Arial" style:font-family-generic="swiss"/>';
        return `<text:list-level-style-bullet text:level="${level}" text:style-name="List_20_Marker" text:bullet-char="${BULLETS[kind]}">${position}${font}</text:list-level-style-bullet>`;
      }).join('');
    const lists = (['decimal', 'disc', 'circle', 'square'] as ListKind[])
      .map((kind) => `<text:list-style style:name="LWrite_${kind}" style:display-name="LWrite ${kind}">${listLevels(kind)}</text:list-style>`)
      .join('');
    const quoteBar = `${pt(s.blockquote.borderWidth)} solid #${s.borderColor}`;
    const g = this.geometry;
    return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">${fontDecls}<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0pt" fo:margin-bottom="0pt" style:line-height-at-least="${pt(s.sizePx * s.lineHeight)}" fo:orphans="2" fo:widows="2" style:writing-mode="page" style:tab-stop-distance="36pt"/><style:text-properties style:font-name="${family}" style:font-name-asian="${family}" style:font-name-complex="${family}" fo:font-size="${pt(s.sizePx)}" style:font-size-asian="${pt(s.sizePx)}" style:font-size-complex="${pt(s.sizePx)}" fo:color="#${s.color}" ${locale} fo:hyphenate="false"/></style:default-style><style:default-style style:family="graphic"><style:graphic-properties style:flow-with-text="false"/></style:default-style><style:default-style style:family="table"><style:table-properties table:border-model="collapsing"/></style:default-style><style:style style:name="Standard" style:family="paragraph" style:class="text"><style:paragraph-properties fo:margin-top="${pt(s.paragraph.marginTop)}" fo:margin-bottom="0pt"/></style:style>${heading(1)}${heading(2)}${heading(3)}<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="0pt" fo:border-left="${quoteBar}" fo:border-right="none" fo:border-top="none" fo:border-bottom="none" fo:padding-left="${pt(s.blockquote.paddingLeft)}" style:join-border="true"/>${textProperties({ weight: String(s.blockquote.weight), italic: true })}</style:style><style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-top="${pt(s.table.paragraphMarginTop)}" style:line-height-at-least="${pt(s.table.sizePx * s.table.lineHeight)}"/>${textProperties({ sizePx: s.table.sizePx })}</style:style><style:style style:name="Table_20_Heading" style:display-name="Table Heading" style:family="paragraph" style:parent-style-name="Table_20_Contents" style:class="extra">${textProperties({ weight: String(s.table.headerWeight) })}</style:style><style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="${pt(s.codeBlock.margin)}" fo:line-height="${pt(s.codeBlock.lineHeightPx)}" fo:background-color="#${s.codeBlock.background}" fo:padding-top="${pt(s.codeBlock.paddingY)}" fo:padding-bottom="${pt(s.codeBlock.paddingY)}" fo:padding-left="${pt(s.codeBlock.paddingX)}" fo:padding-right="${pt(s.codeBlock.paddingX)}" fo:border="none"><style:background-image/></style:paragraph-properties>${textProperties({ font: mono, sizePx: s.codeBlock.sizePx })}</style:style><style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:line-height="1pt" fo:border-top="none" fo:border-left="none" fo:border-right="none" fo:border-bottom="${pt(s.rule.width)} solid #${s.borderColor}" fo:padding="0pt"/>${textProperties({ sizePx: 1 })}</style:style><style:style style:name="Picture_20_Paragraph" style:display-name="Picture Paragraph" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:line-height="100%" fo:text-align="center"/></style:style><style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="as-char" svg:y="0pt" style:wrap="none" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style><style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#${s.linkColor}" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style><style:style style:name="List_20_Marker" style:display-name="List Marker" style:family="text"><style:text-properties fo:color="#${s.mutedColor}" fo:font-weight="normal" fo:font-style="normal"/></style:style>${lists}</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${g.widthPt}pt" fo:page-height="${g.heightPt}pt" style:print-orientation="portrait" fo:margin-top="${g.marginPt}pt" fo:margin-bottom="${g.marginPt}pt" fo:margin-left="${g.marginPt}pt" fo:margin-right="${g.marginPt}pt" style:writing-mode="lr-tb"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`;
  }
}

function metaXml(name: string, language: string): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} office:version="1.3"><office:meta><meta:generator>LWrite</meta:generator><dc:title>${escapeXml(name.trim() || 'Untitled')}</dc:title><dc:language>${escapeXml(language)}</dc:language><meta:creation-date>${now}</meta:creation-date><dc:date>${now}</dc:date></office:meta></office:document-meta>`;
}

function settingsXml(embedFonts: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" office:version="1.3"><office:settings><config:config-item-set config:name="ooo:configuration-settings"><config:config-item config:name="EmbedFonts" config:type="boolean">${embedFonts}</config:config-item><config:config-item config:name="EmbedOnlyUsedFonts" config:type="boolean">true</config:config-item><config:config-item config:name="AddParaTableSpacing" config:type="boolean">true</config:config-item><config:config-item config:name="AddParaTableSpacingAtStart" config:type="boolean">false</config:config-item></config:config-item-set></office:settings></office:document-settings>`;
}

function manifestXml(media: Array<{ path: string; mimeType: string }>, fonts: Array<{ path: string }>): string {
  const entries = [
    ...media.map((entry) => `<manifest:file-entry manifest:full-path="${entry.path}" manifest:media-type="${entry.mimeType}"/>`),
    ...fonts.map((entry) => `<manifest:file-entry manifest:full-path="${entry.path}" manifest:media-type="application/x-font-ttf"/>`),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml"/>${entries}</manifest:manifest>`;
}
