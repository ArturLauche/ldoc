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
  imagePlaceholderRuns,
  normalizeColorToHex,
  normalizeFontFamilyValue,
  normalizeRuns,
  resolvePtFromCssSize,
} from './shared';
import type { WarningCollector } from './warnings';

interface DocxMedia {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

interface DocxRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: 'External';
}

interface ListInfo {
  level: number;
  numId: number;
}

class DocxContext {
  readonly documentRelationships: DocxRelationship[] = [
    {
      id: 'rId1',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering',
      target: 'numbering.xml',
    },
    {
      id: 'rId2',
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
      target: 'styles.xml',
    },
  ];

  readonly media: DocxMedia[] = [];
  private nextRelationshipId = 3;
  private nextImageId = 1;
  private nextNumId = 3;
  private readonly numIds = new Map<string, number>([
    ['bullet:1', 1],
    ['ordered:1', 2],
  ]);

  constructor(readonly warnings: WarningCollector) {}

  addHyperlink(href: string): string {
    const id = this.nextRelationship();
    this.documentRelationships.push({
      id,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
      target: href,
      targetMode: 'External',
    });
    return id;
  }

  addImage(image: ExportImageBlock): { relationshipId: string; name: string; path: string } | null {
    if (!image.prepared) return null;
    const id = this.nextRelationship();
    const imageId = this.nextImageId;
    this.nextImageId += 1;
    const name = `Image ${imageId}`;
    const path = `media/image${imageId}.${image.prepared.extension}`;
    this.media.push({
      path: `word/${path}`,
      bytes: image.prepared.bytes,
      contentType: image.prepared.mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
    });
    this.documentRelationships.push({
      id,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      target: path,
    });
    return { relationshipId: id, name, path };
  }

  getListNumId(list: ExportListBlock): number {
    const key = `${list.ordered ? 'ordered' : 'bullet'}:${list.start}`;
    const existing = this.numIds.get(key);
    if (existing) return existing;
    const numId = this.nextNumId;
    this.nextNumId += 1;
    this.numIds.set(key, numId);
    return numId;
  }

  buildNumberingXml(): string {
    const nums = Array.from(this.numIds.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([key, numId]) => {
        const [kind, startRaw] = key.split(':');
        const start = Number.parseInt(startRaw, 10);
        const abstractNumId = kind === 'ordered' ? 2 : 1;
        const override =
          kind === 'ordered' && start > 1
            ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${start}"/></w:lvlOverride>`
            : '';
        return `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractNumId}"/>${override}</w:num>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">${buildNumberingLevels('bullet')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="2">${buildNumberingLevels('decimal')}</w:abstractNum>
  ${nums}
</w:numbering>`;
  }

  private nextRelationship(): string {
    const id = `rId${this.nextRelationshipId}`;
    this.nextRelationshipId += 1;
    return id;
  }
}

export async function renderDocx(documentModel: ExportDocumentModel, warnings: WarningCollector): Promise<Blob> {
  const JSZip = await import('jszip').then((module) => module.default);
  const context = new DocxContext(warnings);
  const documentXml = buildDocumentXml(documentModel, context);
  const zip = new JSZip();

  zip.file('[Content_Types].xml', buildContentTypesXml(context.media));
  zip.file('_rels/.rels', buildPackageRelsXml());
  zip.file('docProps/core.xml', buildCoreXml(documentModel.name));
  zip.file('docProps/app.xml', buildAppXml());
  zip.file('word/_rels/document.xml.rels', buildRelationshipsXml(context.documentRelationships));
  zip.file('word/document.xml', documentXml);
  zip.file('word/numbering.xml', context.buildNumberingXml());
  zip.file('word/styles.xml', buildStylesXml());
  context.media.forEach((media) => zip.file(media.path, media.bytes));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function buildDocumentXml(documentModel: ExportDocumentModel, context: DocxContext): string {
  const body = documentModel.blocks.map((block) => renderBlock(block, context, 0)).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${body || renderParagraph([{ text: '', marks: {} }], undefined, context)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function renderBlock(block: ExportBlock, context: DocxContext, level: number, listInfo?: ListInfo): string {
  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') {
    return renderParagraph(block.runs, block, context, listInfo);
  }
  if (block.type === 'horizontal-rule') {
    return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>`;
  }
  if (block.type === 'image') return renderImageParagraph(block, context, listInfo);
  if (block.type === 'table') return renderTable(block.rows, context);
  if (block.type === 'list') return renderList(block, context, level);
  return '';
}

function renderList(list: ExportListBlock, context: DocxContext, level: number): string {
  const numId = context.getListNumId(list);
  return list.items
    .map((item) => {
      const [first, ...rest] = item.blocks;
      const firstXml = first
        ? renderBlock(first, context, level, { level, numId })
        : renderParagraph([{ text: '', marks: {} }], undefined, context, { level, numId });
      return `${firstXml}${rest.map((block) => renderBlock(block, context, level + 1)).join('')}`;
    })
    .join('');
}

function renderTable(rows: ExportTableCell[][] | { cells: ExportTableCell[] }[], context: DocxContext): string {
  context.warnings.add('table-layout-simplified');
  const rowXml = rows
    .map((row) => {
      const cells = Array.isArray(row) ? row : row.cells;
      return `<w:tr>${cells.map((cell) => renderTableCell(cell, context)).join('')}</w:tr>`;
    })
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="8" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="8" w:space="0" w:color="D4D4D4"/><w:insideV w:val="single" w:sz="8" w:space="0" w:color="D4D4D4"/></w:tblBorders></w:tblPr>${rowXml}</w:tbl>`;
}

function renderTableCell(cell: ExportTableCell, context: DocxContext): string {
  const gridSpan = cell.colSpan > 1 ? `<w:gridSpan w:val="${cell.colSpan}"/>` : '';
  const vMerge = cell.rowSpan > 1 ? '<w:vMerge w:val="restart"/>' : '';
  const headerFill = cell.header ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>' : '';
  const body = cell.blocks.map((block) => renderBlock(block, context, 0)).join('') || '<w:p/>';
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${gridSpan}${vMerge}${headerFill}</w:tcPr>${body}</w:tc>`;
}

function renderParagraph(
  runs: ExportInlineRun[],
  block: Extract<ExportBlock, { type: 'paragraph' | 'heading' | 'blockquote' }> | undefined,
  context: DocxContext,
  listInfo?: ListInfo,
): string {
  const paragraphProps: string[] = [];
  if (block?.type === 'heading') paragraphProps.push(`<w:spacing w:before="240" w:after="120"/>`);
  if (block?.type === 'blockquote') paragraphProps.push('<w:ind w:left="360"/><w:color w:val="666666"/>');
  if (listInfo) paragraphProps.push(`<w:numPr><w:ilvl w:val="${Math.min(listInfo.level, 8)}"/><w:numId w:val="${listInfo.numId}"/></w:numPr>`);
  if (block?.align) paragraphProps.push(`<w:jc w:val="${docxAlignment(block.align)}"/>`);
  const props = paragraphProps.length ? `<w:pPr>${paragraphProps.join('')}</w:pPr>` : '';
  return `<w:p>${props}${renderRuns(runs, context, block?.type === 'heading' ? block.level : undefined)}</w:p>`;
}

function renderRuns(runs: ExportInlineRun[], context: DocxContext, headingLevel?: 1 | 2 | 3): string {
  return normalizeRuns(runs)
    .map((run) => {
      const parts = run.text.split('\n');
      const runXml = parts
        .map((part, index) => {
          const breakTag = index > 0 ? '<w:r><w:br/></w:r>' : '';
          return `${breakTag}<w:r>${buildRunProps(run.marks, headingLevel)}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
        })
        .join('');
      if (!run.link?.href) return runXml;
      const id = context.addHyperlink(run.link.href);
      return `<w:hyperlink r:id="${id}" w:history="1">${runXml}</w:hyperlink>`;
    })
    .join('');
}

function renderImageParagraph(image: ExportImageBlock, context: DocxContext, listInfo?: ListInfo): string {
  const media = context.addImage(image);
  if (!media || !image.prepared) {
    return renderParagraph(imagePlaceholderRuns(image), undefined, context, listInfo);
  }
  const width = resolveDisplayWidth(image);
  const height = Math.round((width / image.prepared.width) * image.prepared.height);
  const cx = pxToEmu(width);
  const cy = pxToEmu(height);
  const props = listInfo ? `<w:pPr><w:numPr><w:ilvl w:val="${Math.min(listInfo.level, 8)}"/><w:numId w:val="${listInfo.numId}"/></w:numPr></w:pPr>` : '';
  const descr = escapeXmlAttr(image.alt || media.name);
  return `<w:p>${props}<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${media.name.replace(/\D/g, '')}" name="${escapeXmlAttr(media.name)}" descr="${descr}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${escapeXmlAttr(media.name)}" descr="${descr}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${media.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function buildRunProps(marks: ExportInlineMarks, headingLevel?: 1 | 2 | 3): string {
  const props: string[] = [];
  if (headingLevel) props.push('<w:b/>', `<w:sz w:val="${headingLevel === 1 ? 48 : headingLevel === 2 ? 36 : 28}"/>`);
  if (marks.bold) props.push('<w:b/>');
  if (marks.italic) props.push('<w:i/>');
  if (marks.underline) props.push('<w:u w:val="single"/>');
  if (marks.strike) props.push('<w:strike/>');
  if (marks.superscript) props.push('<w:vertAlign w:val="superscript"/>');
  if (marks.subscript) props.push('<w:vertAlign w:val="subscript"/>');
  const color = normalizeColorToHex(marks.color);
  if (color) props.push(`<w:color w:val="${color}"/>`);
  const highlight = normalizeDocxHighlight(marks.highlight);
  if (highlight) props.push(`<w:highlight w:val="${highlight}"/>`);
  if (marks.fontFamily) {
    const font = escapeXmlAttr(normalizeFontFamilyValue(marks.fontFamily));
    props.push(`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`);
  }
  const size = resolvePtFromCssSize(marks.fontSize);
  if (size) props.push(`<w:sz w:val="${Math.round(size * 2)}"/>`);
  return props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
}

function buildContentTypesXml(media: DocxMedia[]): string {
  const defaults = new Map([
    ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
    ['xml', 'application/xml'],
  ]);
  media.forEach((entry) => {
    defaults.set(entry.path.endsWith('.png') ? 'png' : 'jpg', entry.contentType);
  });
  const defaultXml = Array.from(defaults.entries())
    .map(([extension, contentType]) => `<Default Extension="${extension}" ContentType="${contentType}"/>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaultXml}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function buildPackageRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildRelationshipsXml(relationships: DocxRelationship[]): string {
  const entries = relationships
    .map((relationship) => {
      const targetMode = relationship.targetMode ? ` TargetMode="${relationship.targetMode}"` : '';
      return `<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${escapeXmlAttr(relationship.target)}"${targetMode}/>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Noto Sans" w:hAnsi="Noto Sans"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
</w:styles>`;
}

function buildCoreXml(title: string): string {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title><dc:creator>LWrite</dc:creator><cp:lastModifiedBy>LWrite</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(now)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${escapeXml(now)}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LWrite</Application></Properties>`;
}

function buildNumberingLevels(kind: 'bullet' | 'decimal'): string {
  return Array.from({ length: 9 })
    .map((_, level) => {
      const left = 720 + level * 360;
      const fmt = kind === 'bullet' ? 'bullet' : 'decimal';
      const text = kind === 'bullet' ? '&#8226;' : `%${level + 1}.`;
      return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`;
    })
    .join('');
}

function normalizeDocxHighlight(color?: string): string | null {
  const hex = normalizeColorToHex(color);
  if (!hex) return null;
  const mapping: Record<string, string> = {
    FFFFFF: 'white',
    FFFF00: 'yellow',
    '00FF00': 'green',
    '00FFFF': 'cyan',
    FF00FF: 'magenta',
    FF0000: 'red',
    '0000FF': 'blue',
    '000000': 'black',
    '808080': 'gray',
  };
  return mapping[hex] ?? null;
}

function docxAlignment(value: string): string {
  if (value === 'justify') return 'both';
  return value;
}

function resolveDisplayWidth(image: ExportImageBlock): number {
  if (!image.prepared) return 1;
  const maxWidth = 624;
  const percent = image.widthPercent ?? 100;
  return Math.max(1, Math.min(image.prepared.width, Math.round((maxWidth * percent) / 100)));
}

function pxToEmu(value: number): number {
  return Math.round(value * 9525);
}
