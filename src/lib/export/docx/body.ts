import { toHex } from '../color';
import { MONOSPACE_FAMILY, resolveFamily, type ResolvedFamily } from '../fonts/catalog';
import {
  asciiUri,
  escapeXml,
  escapeXmlAttr,
  expandTableGrid,
  graphicAltText,
  graphicToFallbackBlocks,
  imageLabel,
  followableHref,
  imagePlaceholderRuns,
  linkTarget,
  resolveColumnWidths,
} from '../shared';
import { styledRuns } from '../textUsage';
import {
  DOCUMENT_STYLE,
  flowLeaves,
  lineBoxPx,
  textBaseStyle,
  type FlowLeaf,
  type MarginContext,
  type PageGeometry,
  type RunStyle,
  type TextBaseStyle,
  type TextContext,
} from '../typography';
import type {
  ExportAlignment,
  ExportBlock,
  ExportCodeBlock,
  ExportGraphicBlock,
  ExportImageBlock,
  ExportTableBlock,
  ExportTextBlock,
  PreparedExportImage,
} from '../types';
import type { WarningCollector } from '../warnings';
import {
  NumberingRegistry,
  RELATIONSHIP_TYPES,
  emu,
  eighths,
  halfPoints,
  twips,
  type NumberingKind,
  type Relationship,
} from './parts';

/** Where a flow renders: extra indentation, and the table cell it sits in. */
export interface FlowScope {
  indent: number;
  cell?: { context: TextContext; align?: ExportAlignment };
}

/** Produces `word/document.xml` body content and collects relationships and media. */
export class DocxBodyWriter {
  readonly relationships: Relationship[] = [];
  readonly media: Array<{ path: string; bytes: Uint8Array; extension: string }> = [];
  readonly numbering = new NumberingRegistry();
  /** Families referenced by runs (for the font table). */
  readonly families = new Map<string, ResolvedFamily>();
  private nextRelationship: number;
  private nextDrawing = 1;
  private nextAnchorHeight = 251658240;
  private readonly hyperlinks = new Map<string, string>();
  /** A link goes to the start of the document (`#` or `#top`). */
  linksToTop = false;
  private readonly imageRelationships = new Map<PreparedExportImage | Uint8Array, string>();

  constructor(
    firstRelationshipId: number,
    private readonly geometry: PageGeometry,
    private readonly warnings: WarningCollector,
  ) {
    this.nextRelationship = firstRelationshipId;
  }

  private relationship(type: string, target: string, external = false): string {
    const id = `rId${this.nextRelationship}`;
    this.nextRelationship += 1;
    this.relationships.push({ id, type, target, ...(external ? { external } : {}) });
    return id;
  }

  private hyperlink(href: string): string {
    let id = this.hyperlinks.get(href);
    if (!id) {
      id = this.relationship(RELATIONSHIP_TYPES.hyperlink, asciiUri(href), true);
      this.hyperlinks.set(href, id);
    }
    return id;
  }

  private mediaRelationship(key: PreparedExportImage | Uint8Array, bytes: Uint8Array, extension: string): string {
    let id = this.imageRelationships.get(key);
    if (!id) {
      const path = `media/image${this.media.length + 1}.${extension}`;
      this.media.push({ path: `word/${path}`, bytes, extension });
      id = this.relationship(RELATIONSHIP_TYPES.image, path);
      this.imageRelationships.set(key, id);
    }
    return id;
  }

  /** Renders blocks of one flow (the page, or a table cell). */
  flow(blocks: ExportBlock[], container: MarginContext['container'], scope: FlowScope): string {
    const { leaves, trailing } = flowLeaves(blocks, container);
    const parts: Array<{ xml: (after: number) => string; table?: boolean }> = [];
    let pendingFloats: string[] = [];
    leaves.forEach((leaf, index) => {
      const before = container === 'root' && index === 0 ? 0 : leaf.spaceBefore;
      const block = leaf.block;
      if (block.type === 'image' && block.float && block.prepared) {
        pendingFloats.push(this.drawing(block, leaf, true));
        return;
      }
      const floats = pendingFloats;
      pendingFloats = [];
      switch (block.type) {
        case 'paragraph':
        case 'heading':
          parts.push({ xml: (after) => this.paragraph(block, leaf, before, after, scope, floats) });
          break;
        case 'code-block':
          parts.push({ xml: (after) => this.code(block, leaf, before, after, scope, floats) });
          break;
        case 'horizontal-rule':
          parts.push({
            xml: (after) =>
              `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="${eighths(DOCUMENT_STYLE.rule.width)}" w:space="0" w:color="${DOCUMENT_STYLE.borderColor}"/></w:pBdr>${spacing(before, after, 'single')}${indentXml(leaf, scope.indent)}<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr>${floats.join('')}</w:p>`,
          });
          break;
        case 'image':
          parts.push({ xml: (after) => this.imageParagraph(block, leaf, before, after, scope, floats) });
          break;
        case 'graphic':
          if (block.raster && block.svg) {
            parts.push({ xml: (after) => this.graphicParagraph(block, leaf, before, after, scope, floats) });
          } else {
            this.warnings.add('graphic-layout-simplified');
            const fallback = graphicToFallbackBlocks(block);
            if (floats.length) parts.push({ xml: () => hairlineParagraph(floats) });
            parts.push({ xml: () => this.flow(fallback, container === 'cell' ? 'cell' : 'blockquote', scope) });
          }
          break;
        case 'table': {
          const gap = before;
          const previous = parts[parts.length - 1];
          if (previous && !previous.table) {
            // Space above a table is the preceding paragraph's space after.
            const render = previous.xml;
            previous.xml = (after) => render(Math.max(after, gap));
          }
          // Floats before a table anchor in a hairline paragraph above it. Word also
          // needs a paragraph between consecutive tables, or it merges them.
          if (floats.length || previous?.table) parts.push({ xml: () => hairlineParagraph(floats) });
          parts.push({ xml: () => this.table(block, leaf, scope), table: true });
          break;
        }
        default:
          break;
      }
    });
    if (pendingFloats.length) parts.push({ xml: () => `<w:p>${pendingFloats.join('')}</w:p>` });
    return parts.map((part, index) => part.xml(index === parts.length - 1 && container === 'cell' ? trailing : 0)).join('');
  }

  private paragraphStyle(block: ExportTextBlock, leaf: FlowLeaf, scope: FlowScope): string | null {
    if (block.type === 'heading') return `Heading${block.level ?? 1}`;
    if (scope.cell) return scope.cell.context.header ? 'TableHeading' : 'TableText';
    if (leaf.quoteDepth > 0) return 'Quote';
    return null;
  }

  private context(block: ExportTextBlock, leaf: FlowLeaf, scope: FlowScope): TextContext {
    if (block.type === 'heading') return { kind: 'heading', level: block.level ?? 1, quote: leaf.quoteDepth > 0 };
    if (scope.cell) return { ...scope.cell.context, quote: leaf.quoteDepth > 0 };
    return { kind: 'body', quote: leaf.quoteDepth > 0 };
  }

  private paragraph(
    block: ExportTextBlock,
    leaf: FlowLeaf,
    before: number,
    after: number,
    scope: FlowScope,
    floats: string[],
  ): string {
    const context = this.context(block, leaf, scope);
    const base = textBaseStyle(context);
    const runs = styledRuns({ runs: block.runs, context }, false);
    const line = lineBoxPx(base, runs.map(({ style }) => style));
    const pStyle = this.paragraphStyle(block, leaf, scope);
    const align = block.align ?? scope.cell?.align;
    const properties = [
      pStyle ? `<w:pStyle w:val="${pStyle}"/>` : '',
      this.numberingXml(leaf),
      spacing(before, after, Math.abs(line - base.sizePx * base.lineHeight) > 0.01 ? line : null),
      indentXml(leaf, scope.indent, Boolean(leaf.listItem)),
      align ? `<w:jc w:val="${align === 'justify' ? 'both' : align}"/>` : '',
    ].join('');
    // Run properties are relative to the paragraph style, which has no cell text color.
    const styleBase = context.color === undefined ? base : textBaseStyle({ ...context, color: undefined });
    const content = this.runs(runs, styleBase);
    return `<w:p><w:pPr>${properties}</w:pPr>${floats.join('')}${content}</w:p>`;
  }

  private numberingXml(leaf: FlowLeaf): string {
    if (!leaf.listItem) return '';
    const { list, depth, bulletDepth } = leaf.listItem;
    const kind: NumberingKind = list.ordered ? 'decimal' : bulletDepth <= 1 ? 'disc' : bulletDepth === 2 ? 'circle' : 'square';
    const level = Math.min(8, depth - 1);
    const numId = this.numbering.numFor(list, kind, level, list.start);
    return `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`;
  }

  /** Runs, grouping consecutive runs of one link into a single hyperlink. */
  private runs(runs: Array<{ text: string; style: RunStyle; run: { link?: { href: string } } }>, base: TextBaseStyle): string {
    const out: string[] = [];
    let index = 0;
    while (index < runs.length) {
      const href = runs[index].run.link?.href;
      const address = href ? this.linkAddress(href) : null;
      if (href && address) {
        const group: string[] = [];
        while (index < runs.length && runs[index].run.link?.href === href) {
          group.push(this.run(runs[index].text, runs[index].style, base, true));
          index += 1;
        }
        out.push(`<w:hyperlink ${address} w:history="1">${group.join('')}</w:hyperlink>`);
        continue;
      }
      out.push(this.run(runs[index].text, runs[index].style, base, false));
      index += 1;
    }
    return out.join('');
  }

  /**
   * Where a hyperlink points: a relationship for addresses and paths (relative
   * paths stay relative to the saved file), or the `top` bookmark for the start
   * of the document. null for a fragment with no target (`followableHref`).
   */
  private linkAddress(href: string): string | null {
    if (!followableHref(href, this.warnings)) return null;
    if (linkTarget(href).kind === 'fragment') {
      this.linksToTop = true;
      return 'w:anchor="top"';
    }
    return `r:id="${this.hyperlink(href)}"`;
  }

  run(text: string, style: RunStyle, base: TextBaseStyle, link: boolean): string {
    if (!text) return '';
    this.families.set(style.family.name, style.family);
    const props: string[] = [];
    if (link) props.push('<w:rStyle w:val="Hyperlink"/>');
    else if (style.code) props.push('<w:rStyle w:val="InlineCode"/>');
    if (style.family.name !== base.family.name && !style.code) {
      const font = escapeXmlAttr(style.family.name);
      props.push(`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`);
    }
    const bold = style.weight >= 600;
    const baseBold = base.weight >= 600;
    if (bold !== baseBold && !(style.code && bold)) props.push(bold ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>');
    if (style.italic !== base.italic) props.push(style.italic ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>');
    if (style.strike) props.push('<w:strike/>');
    if (style.color !== (link ? DOCUMENT_STYLE.linkColor : base.color)) props.push(`<w:color w:val="${style.color}"/>`);
    // Word shrinks super/subscript itself: keep the surrounding size.
    const size = halfPoints(style.superscript || style.subscript ? style.parentSizePx : style.sizePx);
    if (size !== halfPoints(base.sizePx)) props.push(`<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`);
    // Arbitrary highlight colors are run shading; w:highlight only has 16 colors.
    // CT_RPr order: u, then shd, then vertAlign.
    if (style.underline && !link) props.push('<w:u w:val="single"/>');
    if (style.highlight) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${style.highlight}"/>`);
    if (style.superscript) props.push('<w:vertAlign w:val="superscript"/>');
    else if (style.subscript) props.push('<w:vertAlign w:val="subscript"/>');
    const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
    return text
      .split('\n')
      .map((line, index) => {
        const pieces = line.split('\t').map((piece) => (piece ? `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>` : ''));
        return `<w:r>${rPr}${index > 0 ? '<w:br/>' : ''}${pieces.join('<w:tab/>')}</w:r>`;
      })
      .join('');
  }

  private code(block: ExportCodeBlock, leaf: FlowLeaf, before: number, after: number, scope: { indent: number }, floats: string[]): string {
    this.families.set(MONOSPACE_FAMILY, resolveFamily(MONOSPACE_FAMILY));
    const style = DOCUMENT_STYLE.codeBlock;
    const lines = block.text.split('\n');
    const runs = lines
      .map((line, index) => {
        const pieces = line.split('\t').map((piece) => (piece ? `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>` : ''));
        return `<w:r>${index > 0 ? '<w:br/>' : ''}${pieces.join('<w:tab/>')}</w:r>`;
      })
      .join('');
    const indent = twips(scope.indent) + (leaf.listDepth ? twips(leaf.listDepth * (DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding)) : 0) + twips(leaf.quoteDepth * (DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft));
    // Padding above and below the code lines is part of the shaded box.
    return `<w:p><w:pPr><w:pStyle w:val="Code"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="${Math.round(style.paddingY * 0.75)}" w:color="${style.background}"/><w:bottom w:val="single" w:sz="4" w:space="${Math.round(style.paddingY * 0.75)}" w:color="${style.background}"/></w:pBdr><w:spacing w:before="${twips(before + style.paddingY)}" w:after="${twips(after + style.paddingY)}"/><w:ind w:left="${indent + twips(style.paddingX)}" w:right="${twips(style.paddingX)}"/></w:pPr>${floats.join('')}${runs}</w:p>`;
  }

  private imageParagraph(
    image: ExportImageBlock,
    leaf: FlowLeaf,
    before: number,
    after: number,
    scope: FlowScope,
    floats: string[],
  ): string {
    if (!image.prepared) {
      const context: TextContext = scope.cell?.context ?? { kind: 'body' };
      const base = textBaseStyle(context);
      const runs = styledRuns({ runs: imagePlaceholderRuns(image), context }, false);
      return `<w:p><w:pPr>${spacing(before, after, null)}${indentXml(leaf, scope.indent)}<w:jc w:val="center"/></w:pPr>${floats.join('')}${this.runs(runs, base)}</w:p>`;
    }
    return `<w:p><w:pPr>${this.numberingXml(leaf)}${spacing(before, after, 'single')}${indentXml(leaf, scope.indent, Boolean(leaf.listItem))}<w:jc w:val="center"/></w:pPr>${floats.join('')}${this.drawing(image, leaf, false, scope)}</w:p>`;
  }

  private available(leaf: FlowLeaf, scope: { indent: number }): number {
    const listIndent = leaf.listDepth * (DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding);
    const quoteIndent = leaf.quoteDepth * (DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft);
    return Math.max(48, this.geometry.contentWidthPx - scope.indent - listIndent - quoteIndent);
  }

  private drawing(image: ExportImageBlock, leaf: FlowLeaf, floating: boolean, scope: { indent: number } = { indent: 0 }): string {
    const prepared = image.prepared as PreparedExportImage;
    const available = this.available(leaf, scope);
    let width = image.widthPercent ? (available * image.widthPercent) / 100 : Math.min(prepared.width, available);
    width = Math.min(width, available);
    const height = (width / prepared.width) * prepared.height;
    const relationshipId = this.mediaRelationship(prepared, prepared.bytes, prepared.extension === 'png' ? 'png' : 'jpg');
    const radius = Math.round((DOCUMENT_STYLE.image.radius / Math.max(1, Math.min(width, height))) * 100000);
    const picture = this.picture(relationshipId, emu(width), emu(height), imageLabel(image), radius);
    return this.wrapDrawing(picture, emu(width), emu(height), image.alt || imageLabel(image), floating ? image.float : undefined);
  }

  private picture(relationshipId: string, cx: number, cy: number, name: string, radius: number, svgRelationshipId?: string): string {
    const svg = svgRelationshipId
      ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgRelationshipId}"/></a:ext></a:extLst>`
      : '';
    const geometry = radius > 0
      ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, radius)}"/></a:avLst></a:prstGeom>`
      : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    return `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXmlAttr(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}">${svg}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>${geometry}</pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  }

  private wrapDrawing(graphic: string, cx: number, cy: number, description: string, float?: 'left' | 'right'): string {
    const id = this.nextDrawing;
    this.nextDrawing += 1;
    const docPr = `<wp:docPr id="${id}" name="Picture ${id}" descr="${escapeXmlAttr(description)}"/>`;
    const locks = '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>';
    if (!float) {
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>${docPr}${locks}${graphic}</wp:inline></w:drawing></w:r>`;
    }
    const gap = emu(DOCUMENT_STYLE.image.floatGap);
    const vertical = emu(DOCUMENT_STYLE.image.floatMargin);
    this.nextAnchorHeight += 1;
    // A square-wrapped floating picture: text flows beside it, like the editor's floats.
    return `<w:r><w:drawing><wp:anchor distT="${vertical}" distB="${vertical}" distL="${float === 'right' ? gap : 0}" distR="${float === 'left' ? gap : 0}" simplePos="0" relativeHeight="${this.nextAnchorHeight}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:align>${float}</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${vertical}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/>${docPr}${locks}${graphic}</wp:anchor></w:drawing></w:r>`;
  }

  private graphicParagraph(
    graphic: ExportGraphicBlock,
    leaf: FlowLeaf,
    before: number,
    after: number,
    scope: { indent: number },
    floats: string[],
  ): string {
    const raster = graphic.raster as PreparedExportImage;
    const svg = graphic.svg as Uint8Array;
    const available = this.available(leaf, scope);
    const aspect = raster.height / raster.width;
    const width = available;
    const height = width * aspect;
    const pngId = this.mediaRelationship(raster, raster.bytes, 'png');
    const svgId = this.mediaRelationship(svg, svg, 'svg');
    const picture = this.picture(pngId, emu(width), emu(height), 'Smart Graphic', 0, svgId);
    return `<w:p><w:pPr>${this.numberingXml(leaf)}${spacing(before, after, 'single')}${indentXml(leaf, scope.indent, Boolean(leaf.listItem))}<w:jc w:val="center"/></w:pPr>${floats.join('')}${this.wrapDrawing(picture, emu(width), emu(height), graphicAltText(graphic))}</w:p>`;
  }

  private table(table: ExportTableBlock, leaf: FlowLeaf, scope: { indent: number }): string {
    const style = DOCUMENT_STYLE.table;
    const { colCount, rows } = expandTableGrid(table);
    const available = this.available(leaf, scope);
    const widths = resolveColumnWidths(table, colCount, available, style.minColumnWidth);
    const total = widths.reduce((sum, width) => sum + width, 0);
    const hidden = table.borders === 'hidden';
    const border = (side: string) =>
      hidden ? `<w:${side} w:val="nil"/>` : `<w:${side} w:val="single" w:sz="${eighths(style.borderWidth)}" w:space="0" w:color="${DOCUMENT_STYLE.borderColor}"/>`;
    const indent = twips(this.geometry.contentWidthPx - available);
    const tblPr = `<w:tblPr><w:tblW w:w="${twips(total)}" w:type="dxa"/>${indent ? `<w:tblInd w:w="${indent}" w:type="dxa"/>` : ''}<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${twips(style.cellPaddingY)}" w:type="dxa"/><w:left w:w="${twips(style.cellPaddingX)}" w:type="dxa"/><w:bottom w:w="${twips(style.cellPaddingY)}" w:type="dxa"/><w:right w:w="${twips(style.cellPaddingX)}" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
    const grid = `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${twips(width)}"/>`).join('')}</w:tblGrid>`;
    const headerRows = table.rows.findIndex((row) => !row.cells.every((cell) => cell.header));
    const rowXml = rows
      .map((cells, rowIndex) => {
        const header = headerRows > 0 && rowIndex < headerRows;
        const cellXml = cells
          .map((entry) => {
            const width = widths.slice(entry.column, entry.column + entry.colSpan).reduce((sum, value) => sum + value, 0);
            const fill = toHex(entry.cell.backgroundColor) ?? (entry.cell.header ? style.headerBackground : style.cellBackground);
            const properties = `<w:tcPr><w:tcW w:w="${twips(width)}" w:type="dxa"/>${entry.colSpan > 1 ? `<w:gridSpan w:val="${entry.colSpan}"/>` : ''}${
              entry.vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : entry.vMerge === 'continue' ? '<w:vMerge/>' : ''
            }<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:vAlign w:val="top"/></w:tcPr>`;
            if (entry.vMerge === 'continue') return `<w:tc>${properties}<w:p/></w:tc>`;
            const cellContext: TextContext = {
              kind: 'cell',
              header: entry.cell.header,
              ...(entry.cell.color ? { color: entry.cell.color } : {}),
            };
            const content = this.flow(entry.cell.blocks, 'cell', {
              indent: 0,
              cell: { context: cellContext, ...(entry.cell.align ? { align: entry.cell.align } : {}) },
            });
            const endsWithTable = content.endsWith('</w:tbl>');
            return `<w:tc>${properties}${content || '<w:p/>'}${endsWithTable ? '<w:p/>' : ''}</w:tc>`;
          })
          .join('');
        return `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cellXml}</w:tr>`;
      })
      .join('');
    return `<w:tbl>${tblPr}${grid}${rowXml}</w:tbl>`;
  }
}


/**
 * Spacing: before/after in px; the line is the CSS line box in px ("at least"),
 * `single` for picture paragraphs, or null for the style's default.
 */
/** Puts a `top` bookmark at the start of the first paragraph. */
export function withTopBookmark(body: string): string {
  return body.replace(/<w:p>(<w:pPr>.*?<\/w:pPr>)?/, (paragraph) => `${paragraph}<w:bookmarkStart w:id="0" w:name="top"/><w:bookmarkEnd w:id="0"/>`);
}

/** A 1pt paragraph: anchors floats above a table, and keeps consecutive tables apart. */
function hairlineParagraph(floats: string[]): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${floats.join('')}</w:p>`;
}

function spacing(before: number, after: number, line: number | 'single' | null): string {
  const rule =
    line === 'single' ? ' w:line="240" w:lineRule="auto"' : line !== null ? ` w:line="${twips(line)}" w:lineRule="atLeast"` : '';
  return `<w:spacing w:before="${twips(before)}" w:after="${twips(after)}"${rule}/>`;
}

/** Indentation for content inside lists and quotes (list paragraphs get a hanging marker). */
function indentXml(leaf: FlowLeaf, extra: number, numbered = false): string {
  const list = leaf.listDepth * (DOCUMENT_STYLE.list.indent + DOCUMENT_STYLE.list.itemPadding);
  const quote = leaf.quoteDepth * (DOCUMENT_STYLE.blockquote.borderWidth + DOCUMENT_STYLE.blockquote.paddingLeft);
  const left = list + quote + extra;
  if (!left) return '';
  return `<w:ind w:left="${twips(left)}"${numbered ? ` w:hanging="${twips(18)}"` : ''}/>`;
}
