import type { ResolvedFamily } from '../fonts/catalog';
import { DEFAULT_DOCUMENT_FAMILY, MONOSPACE_FAMILY, officeFontClass } from '../fonts/catalog';
import { escapeXml, escapeXmlAttr } from '../shared';
import { DOCUMENT_STYLE, type PageGeometry } from '../typography';

/**
 * Static WordprocessingML parts. Child elements follow the schema sequence
 * (ECMA-376 Part 1); Word reports "unreadable content" for out-of-order
 * properties, so builders here keep that order explicitly.
 */

export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** CSS px → twentieths of a point. */
export const twips = (px: number) => Math.round(px * 15);
/** CSS px → half points. */
export const halfPoints = (px: number) => Math.round(px * 1.5);
/** CSS px → EMU. */
export const emu = (px: number) => Math.round(px * 9525);
/** CSS px → eighths of a point (border widths). */
export const eighths = (px: number) => Math.max(2, Math.round(px * 6));

export interface Relationship {
  id: string;
  type: string;
  target: string;
  external?: boolean;
}

export const RELATIONSHIP_TYPES = {
  styles: `${REL}/styles`,
  numbering: `${REL}/numbering`,
  settings: `${REL}/settings`,
  fontTable: `${REL}/fontTable`,
  hyperlink: `${REL}/hyperlink`,
  image: `${REL}/image`,
  font: `${REL}/font`,
} as const;

export function relationshipsXml(relationships: Relationship[]): string {
  const entries = relationships
    .map(
      (relationship) =>
        `<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${escapeXmlAttr(relationship.target)}"${relationship.external ? ' TargetMode="External"' : ''}/>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`;
}

export function packageRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

export function contentTypesXml(extensions: Set<string>): string {
  const defaults: Record<string, string> = {
    rels: 'application/vnd.openxmlformats-package.relationships+xml',
    xml: 'application/xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    odttf: 'application/vnd.openxmlformats-officedocument.obfuscatedFont',
  };
  const used = ['rels', 'xml', ...Array.from(extensions)].filter((extension, index, all) => all.indexOf(extension) === index);
  const wordml = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${used
    .map((extension) => `<Default Extension="${extension}" ContentType="${defaults[extension]}"/>`)
    .join('')}<Override PartName="/word/document.xml" ContentType="${wordml}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${wordml}.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="${wordml}.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="${wordml}.settings+xml"/><Override PartName="/word/fontTable.xml" ContentType="${wordml}.fontTable+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

export function coreXml(title: string, language: string): string {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>LWrite</dc:creator><cp:lastModifiedBy>LWrite</cp:lastModifiedBy><dc:language>${escapeXml(language)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

export function appXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>LWrite</Application></Properties>`;
}

export function settingsXml(embedFonts: boolean, language: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="${W_NS}">${embedFonts ? '<w:embedTrueTypeFonts/><w:saveSubsetFonts/>' : ''}<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="${escapeXmlAttr(language)}"/></w:settings>`;
}

export interface FontTableEntry {
  family: ResolvedFamily;
  regular?: { relationshipId: string; key: string };
  bold?: { relationshipId: string; key: string };
}

export function fontTableXml(entries: FontTableEntry[]): string {
  const fonts = entries
    .map(({ family, regular, bold }) => {
      const pitch = family.kind !== 'unknown' && family.category === 'monospace' ? 'fixed' : 'variable';
      return `<w:font w:name="${escapeXmlAttr(family.name)}"><w:charset w:val="00"/><w:family w:val="${officeFontClass(family)}"/><w:pitch w:val="${pitch}"/>${
        regular ? `<w:embedRegular r:id="${regular.relationshipId}" w:fontKey="${regular.key}"/>` : ''
      }${bold ? `<w:embedBold r:id="${bold.relationshipId}" w:fontKey="${bold.key}"/>` : ''}</w:font>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts xmlns:w="${W_NS}" xmlns:r="${R_NS}">${fonts}</w:fonts>`;
}

/** Run properties in schema order: rFonts, b, i, strike, color, sz, shd, u. */
export function styleRunProperties(options: { font?: string; bold?: boolean; italic?: boolean; color?: string; size?: number; underline?: boolean }): string {
  const parts: string[] = [];
  if (options.font) {
    const font = escapeXmlAttr(options.font);
    parts.push(`<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`);
  }
  if (options.bold !== undefined) parts.push(options.bold ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>');
  if (options.italic !== undefined) parts.push(options.italic ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>');
  if (options.color) parts.push(`<w:color w:val="${options.color}"/>`);
  if (options.size) parts.push(`<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`);
  if (options.underline) parts.push('<w:u w:val="single"/>');
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

/** "At least" line spacing for a CSS line box of `factor` × `sizePx`. */
const line = (sizePx: number, factor: number) => `w:line="${twips(sizePx * factor)}" w:lineRule="atLeast"`;

/** Paragraph and character styles mirroring the editor's typography. */
export function stylesXml(language: string): string {
  const style = DOCUMENT_STYLE;
  const doc = escapeXmlAttr(DEFAULT_DOCUMENT_FAMILY);
  const heading = (level: 1 | 2 | 3) => {
    const spec = style.headings[level];
    return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${twips(spec.marginTop)}" w:after="0" ${line(spec.sizePx, spec.lineHeight)}/><w:outlineLvl w:val="${level - 1}"/></w:pPr>${styleRunProperties({ bold: true, size: halfPoints(spec.sizePx) })}</w:style>`;
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${doc}" w:hAnsi="${doc}" w:eastAsia="${doc}" w:cs="${doc}"/><w:color w:val="${style.color}"/><w:sz w:val="${halfPoints(style.sizePx)}"/><w:szCs w:val="${halfPoints(style.sizePx)}"/><w:lang w:val="${escapeXmlAttr(language)}" w:eastAsia="${escapeXmlAttr(language)}" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" ${line(style.sizePx, style.lineHeight)}/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="${twips(style.paragraph.marginTop)}"/></w:pPr></w:style>${heading(1)}${heading(2)}${heading(3)}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="${eighths(style.blockquote.borderWidth)}" w:space="${Math.round(style.blockquote.paddingLeft * 0.75)}" w:color="${style.borderColor}"/></w:pBdr><w:ind w:left="${twips(style.blockquote.borderWidth + style.blockquote.paddingLeft)}"/></w:pPr>${styleRunProperties({ italic: true })}</w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="${twips(style.table.paragraphMarginTop)}" ${line(style.table.sizePx, style.table.lineHeight)}/></w:pPr>${styleRunProperties({ size: halfPoints(style.table.sizePx) })}</w:style><w:style w:type="paragraph" w:styleId="TableHeading"><w:name w:val="Table Heading"/><w:basedOn w:val="TableText"/><w:qFormat/>${styleRunProperties({ bold: true })}</w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${style.codeBlock.background}"/><w:spacing w:before="${twips(style.codeBlock.margin)}" w:line="${twips(style.codeBlock.lineHeightPx)}" w:lineRule="exact"/><w:ind w:left="${twips(style.codeBlock.paddingX)}" w:right="${twips(style.codeBlock.paddingX)}"/></w:pPr>${styleRunProperties({ font: MONOSPACE_FAMILY, size: halfPoints(style.codeBlock.sizePx) })}</w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/>${styleRunProperties({ color: style.linkColor, underline: true })}</w:style><w:style w:type="character" w:styleId="InlineCode"><w:name w:val="Inline Code"/><w:basedOn w:val="DefaultParagraphFont"/>${styleRunProperties({ font: MONOSPACE_FAMILY, bold: true })}</w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/></w:style></w:styles>`;
}

export type NumberingKind = 'decimal' | 'disc' | 'circle' | 'square';

const BULLETS: Record<Exclude<NumberingKind, 'decimal'>, string> = { disc: '•', circle: '◦', square: '▪' };
const ABSTRACT_IDS: Record<NumberingKind, number> = { decimal: 1, disc: 2, circle: 3, square: 4 };

/** One numbering instance per list, so each list restarts at its own start value. */
export class NumberingRegistry {
  private readonly instances: Array<{ id: number; kind: NumberingKind; level: number; start: number }> = [];
  private readonly byList = new Map<object, number>();

  numFor(list: object, kind: NumberingKind, level: number, start: number): number {
    const existing = this.byList.get(list);
    if (existing) return existing;
    const id = this.instances.length + 1;
    this.instances.push({ id, kind, level, start });
    this.byList.set(list, id);
    return id;
  }

  get empty(): boolean {
    return this.instances.length === 0;
  }

  xml(): string {
    const style = DOCUMENT_STYLE;
    const indent = style.list.indent + style.list.itemPadding;
    const abstract = (kind: NumberingKind) => {
      const levels = Array.from({ length: 9 }, (_, level) => {
        const left = twips(indent * (level + 1));
        const text = kind === 'decimal' ? `%${level + 1}.` : BULLETS[kind];
        const font = kind === 'decimal' || kind === 'disc' ? '' : `<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:hint="default"/>`;
        return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${kind === 'decimal' ? 'decimal' : 'bullet'}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="${twips(18)}"/></w:pPr><w:rPr>${font}<w:b w:val="0"/><w:i w:val="0"/><w:color w:val="${style.mutedColor}"/></w:rPr></w:lvl>`;
      }).join('');
      return `<w:abstractNum w:abstractNumId="${ABSTRACT_IDS[kind]}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
    };
    const nums = this.instances
      .map(
        ({ id, kind, level, start }) =>
          `<w:num w:numId="${id}"><w:abstractNumId w:val="${ABSTRACT_IDS[kind]}"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${start}"/></w:lvlOverride></w:num>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="${W_NS}">${(['decimal', 'disc', 'circle', 'square'] as NumberingKind[]).map(abstract).join('')}${nums}</w:numbering>`;
  }
}

export function sectionXml(geometry: PageGeometry): string {
  const margin = Math.round(geometry.marginPt * 20);
  return `<w:sectPr><w:pgSz w:w="${Math.round(geometry.widthPt * 20)}" w:h="${Math.round(geometry.heightPt * 20)}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:space="720"/></w:sectPr>`;
}
