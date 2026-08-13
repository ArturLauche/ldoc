import type {
  ExportBlock,
  ExportDocumentModel,
  ExportImageBlock,
  ExportInlineMarks,
  ExportInlineRun,
  ExportListBlock,
  ExportTableCell,
} from './types';
import {
  escapeXml,
  escapeXmlAttr,
  graphicToFallbackBlocks,
  hashString,
  imagePlaceholderRuns,
  normalizeColorToHex,
  normalizeFontFamilyValue,
  normalizeRuns,
  resolvePtFromCssSize,
  walkBlocks,
  walkRuns,
} from './shared';
import type { WarningCollector } from './warnings';

interface OdtMedia {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

class OdtContext {
  readonly media: OdtMedia[] = [];
  private nextImageId = 1;

  constructor(readonly warnings: WarningCollector) {}

  addImage(image: ExportImageBlock): { href: string; name: string } | null {
    if (!image.prepared) return null;
    const imageId = this.nextImageId;
    this.nextImageId += 1;
    const href = `Pictures/image${imageId}.${image.prepared.extension}`;
    this.media.push({
      path: href,
      bytes: image.prepared.bytes,
      contentType: image.prepared.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    });
    return { href, name: `Image ${imageId}` };
  }
}

export async function renderOdt(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  const JSZip = await import('jszip').then((module) => module.default);
  const context = new OdtContext(warnings);
  const contentXml = buildContentXml(documentModel, context);
  const zip = new JSZip();

  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('content.xml', contentXml);
  zip.file('styles.xml', buildStylesXml(documentModel));
  zip.file('meta.xml', buildMetaXml());
  zip.file('settings.xml', buildSettingsXml());
  zip.file('META-INF/manifest.xml', buildManifestXml(context.media));
  context.media.forEach((media) => zip.file(media.path, media.bytes));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.oasis.opendocument.text',
  });
}

function buildContentXml(documentModel: ExportDocumentModel, context: OdtContext): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  office:version="1.2">
  <office:automatic-styles>${buildAutomaticStyles(documentModel.blocks)}</office:automatic-styles>
  <office:body><office:text>${documentModel.blocks.map((block) => renderBlock(block, context, 0)).join('') || '<text:p/>'}</office:text></office:body>
</office:document-content>`;
}

function renderBlock(block: ExportBlock, context: OdtContext, level: number): string {
  if (block.type === 'paragraph' || block.type === 'blockquote') {
    const style = block.align ? ` text:style-name="${paragraphStyleName(block.align)}"` : '';
    return `<text:p${style}>${renderRuns(block.runs)}</text:p>`;
  }
  if (block.type === 'heading') {
    const style = block.align ? ` text:style-name="${paragraphStyleName(block.align)}"` : '';
    return `<text:h text:outline-level="${block.level ?? 1}"${style}>${renderRuns(block.runs)}</text:h>`;
  }
  if (block.type === 'horizontal-rule') return `<text:p>${escapeXml('-'.repeat(48))}</text:p>`;
  if (block.type === 'image') return renderImage(block, context);
  if (block.type === 'table') return renderTable(block.rows.map((row) => row.cells), context);
  if (block.type === 'graphic') {
    context.warnings.add('graphic-layout-simplified');
    return graphicToFallbackBlocks(block)
      .map((item) => renderBlock(item, context, level))
      .join('');
  }
  if (block.type === 'list') return renderList(block, context, level);
  return '';
}

function renderList(list: ExportListBlock, context: OdtContext, level: number): string {
  const styleName = list.ordered ? 'LWriteNumberedList' : 'LWriteBulletList';
  return `<text:list text:style-name="${styleName}">${list.items
    .map((item, index) => {
      const start = list.ordered && index === 0 && list.start > 1 ? ` text:start-value="${list.start}"` : '';
      return `<text:list-item${start}>${item.blocks.map((block) => renderBlock(block, context, level + 1)).join('') || '<text:p/>'}</text:list-item>`;
    })
    .join('')}</text:list>`;
}

function renderTable(rows: ExportTableCell[][], context: OdtContext): string {
  const maxCols = Math.max(...rows.map((row) => row.reduce((sum, cell) => sum + cell.colSpan, 0)), 1);
  if (rows.some((row) => row.some((cell) => cell.colSpan > 1 || cell.rowSpan > 1))) {
    context.warnings.add('table-layout-simplified');
  }
  const columns = Array.from({ length: maxCols }).map(() => '<table:table-column/>').join('');
  const body = rows
    .map((row) => `<table:table-row>${row.map((cell) => renderTableCell(cell, context)).join('')}</table:table-row>`)
    .join('');
  return `<table:table table:name="Table">${columns}${body}</table:table>`;
}

function renderTableCell(cell: ExportTableCell, context: OdtContext): string {
  const attrs = [
    cell.colSpan > 1 ? ` table:number-columns-spanned="${cell.colSpan}"` : '',
    cell.rowSpan > 1 ? ` table:number-rows-spanned="${cell.rowSpan}"` : '',
  ].join('');
  const body = cell.blocks.map((block) => renderBlock(block, context, 0)).join('') || '<text:p/>';
  return `<table:table-cell office:value-type="string"${attrs}>${body}</table:table-cell>`;
}

function renderImage(image: ExportImageBlock, context: OdtContext): string {
  const media = context.addImage(image);
  if (!media || !image.prepared) {
    return `<text:p>${renderRuns(imagePlaceholderRuns(image))}</text:p>`;
  }
  const width = resolveDisplayWidth(image);
  const height = (width / image.prepared.width) * image.prepared.height;
  return `<text:p><draw:frame draw:name="${escapeXmlAttr(media.name)}" text:anchor-type="paragraph" svg:width="${pxToIn(width)}in" svg:height="${pxToIn(height)}in"><draw:image xlink:href="${escapeXmlAttr(media.href)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`;
}

function renderRuns(runs: ExportInlineRun[]): string {
  return normalizeRuns(runs)
    .map((run) => {
      const content = run.text
        .split('\n')
        .map((line, index) => (index === 0 ? escapeXml(line) : `<text:line-break/>${escapeXml(line)}`))
        .join('');
      const styleName = textStyleName(run.marks);
      const styled = styleName ? `<text:span text:style-name="${styleName}">${content}</text:span>` : content;
      return run.link?.href
        ? `<text:a xlink:type="simple" xlink:href="${escapeXmlAttr(run.link.href)}">${styled}</text:a>`
        : styled;
    })
    .join('');
}

function buildAutomaticStyles(blocks: ExportBlock[]): string {
  const styles = new Map<string, ExportInlineMarks>();
  const alignments = new Set<string>();
  walkRuns(blocks, (run) => {
    const name = textStyleName(run.marks);
    if (name) styles.set(name, run.marks);
  });
  walkBlocks(blocks, (block) => {
    if ((block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') && block.align) {
      alignments.add(block.align);
    }
  });
  const paragraphStyles = Array.from(alignments)
    .map((align) => `<style:style style:name="${paragraphStyleName(align)}" style:family="paragraph"><style:paragraph-properties fo:text-align="${align}"/></style:style>`)
    .join('');
  return `${paragraphStyles}${Array.from(styles.entries()).map(([name, marks]) => buildTextStyle(name, marks)).join('')}`;
}

function buildTextStyle(name: string, marks: ExportInlineMarks): string {
  const props: string[] = [];
  if (marks.bold) props.push('fo:font-weight="bold"');
  if (marks.italic) props.push('fo:font-style="italic"');
  if (marks.underline) props.push('style:text-underline-style="solid" style:text-underline-width="auto"');
  if (marks.strike) props.push('style:text-line-through-style="solid"');
  if (marks.superscript) props.push('style:text-position="super 58%"');
  if (marks.subscript) props.push('style:text-position="sub 58%"');
  const color = normalizeColorToHex(marks.color);
  if (color) props.push(`fo:color="#${color}"`);
  const highlight = normalizeColorToHex(marks.highlight);
  if (highlight) props.push(`fo:background-color="#${highlight}"`);
  if (marks.fontFamily) props.push(`fo:font-family="${escapeXmlAttr(normalizeFontFamilyValue(marks.fontFamily))}"`);
  const size = resolvePtFromCssSize(marks.fontSize);
  if (size) props.push(`fo:font-size="${size.toFixed(1)}pt"`);
  return `<style:style style:name="${name}" style:family="text"><style:text-properties ${props.join(' ')}/></style:style>`;
}

function buildStylesXml(_documentModel: ExportDocumentModel): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph"><style:text-properties fo:font-size="12pt" fo:font-family="Noto Sans"/></style:default-style>
    <text:list-style style:name="LWriteBulletList"><text:list-level-style-bullet text:level="1" text:bullet-char="&#8226;"><style:list-level-properties text:min-label-width="0.25in"/></text:list-level-style-bullet></text:list-style>
    <text:list-style style:name="LWriteNumberedList"><text:list-level-style-number text:level="1" style:num-format="1"><style:list-level-properties text:min-label-width="0.25in"/></text:list-level-style-number></text:list-style>
  </office:styles>
</office:document-styles>`;
}

function buildManifestXml(media: OdtMedia[]): string {
  const mediaEntries = media
    .map((entry) => `<manifest:file-entry manifest:media-type="${entry.contentType}" manifest:full-path="${entry.path}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.text" manifest:full-path="/"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/>
  <manifest:file-entry manifest:media-type="text/xml" manifest:full-path="settings.xml"/>
  <manifest:file-entry manifest:media-type="" manifest:full-path="Pictures/"/>
  ${mediaEntries}
</manifest:manifest>`;
}

function buildMetaXml(): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2"><office:meta><meta:generator>LWrite</meta:generator><meta:creation-date>${escapeXml(now)}</meta:creation-date></office:meta></office:document-meta>`;
}

function buildSettingsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" office:version="1.2"><office:settings><config:config-item-set config:name="ooo:view-settings"/></office:settings></office:document-settings>`;
}

function textStyleName(marks: ExportInlineMarks): string {
  const key = [
    marks.bold ? 'b' : '',
    marks.italic ? 'i' : '',
    marks.underline ? 'u' : '',
    marks.strike ? 's' : '',
    marks.subscript ? 'sub' : '',
    marks.superscript ? 'sup' : '',
    marks.color ? `c:${marks.color}` : '',
    marks.highlight ? `h:${marks.highlight}` : '',
    marks.fontFamily ? `f:${marks.fontFamily}` : '',
    marks.fontSize ? `z:${marks.fontSize}` : '',
  ]
    .filter(Boolean)
    .join('|');
  return key ? `T${hashString(key)}` : '';
}

function paragraphStyleName(align: string): string {
  return `P-${align}`;
}

function resolveDisplayWidth(image: ExportImageBlock): number {
  if (!image.prepared) return 1;
  const maxWidth = 624;
  const percent = image.widthPercent ?? 100;
  return Math.max(1, Math.min(image.prepared.width, Math.round((maxWidth * percent) / 100)));
}

function pxToIn(value: number): string {
  return (value / 96).toFixed(3);
}
