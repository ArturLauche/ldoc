import { parseSmartGraphicFromDom, parseSmartGraphicJson, serializeSmartGraphic } from '@/lib/smartGraphic';
import { cssGenericFamily, resolveFamily } from './fonts/catalog';
import { FALLBACK_FAMILY } from './fonts/fallback';
import { matchFontFace, type UnicodeRange } from './fonts/faces';
import { ExportFontRegistry, loadFallbackBytes, loadFontLicense } from './fonts/registry';
import { truetypeCovered } from './fonts/ttf';
import { noteGraphicFonts } from './graphics/renditions';
import { sceneToSvg } from './graphics/svg';
import { bytesToBase64, escapeHtmlText, graphicAltText, imagePlaceholderRuns, walkBlocks } from './shared';
import { noteDocumentFonts } from './textUsage';
import { DOCUMENT_STYLE, EDITOR_COLUMN_WIDTH, PX_TO_PT, pageGeometry } from './typography';
import type { ExportDocumentModel, ExportGraphicBlock, ExportImageBlock } from './types';
import type { WarningCollector } from './warnings';

/** Layout target of the exported document: the editor column or real paper. */
export interface HtmlExportOptions {
  /**
   * Direct Print: styles the document for the locale's page (the same
   * geometry the PDF export lays out), so printing matches the PDF.
   */
  paper?: boolean;
}

/**
 * HTML: the sanitized editor HTML (so the file opens in LWrite again without
 * loss) styled like the editor's page, with everything it needs inside the
 * file: the fonts it uses (only the faces and unicode-range subsets the text
 * needs), images as data URLs, and Smart Graphics as inline SVG. A content
 * security policy blocks scripts and anything loaded from elsewhere.
 */
export async function renderHtml(
  documentModel: ExportDocumentModel,
  warnings: WarningCollector,
  options: HtmlExportOptions = {},
): Promise<Blob> {
  const registry = new ExportFontRegistry(warnings);
  noteDocumentFonts(registry, documentModel.blocks, { generated: true, graphicFallbacks: false });
  noteGraphicFonts(registry, documentModel);
  await registry.load({ instances: false, fallback: false });

  const body = buildBody(documentModel, warnings, options);
  // Embedded fonts carry their license and copyright notice (OFL condition 2).
  const licenses = new Map<string, string>();
  await Promise.all(
    registry.families
      .filter((usage) => registry.facesOf(usage.family.name))
      .map(async (usage) => {
        const license = await loadFontLicense(usage.family.name);
        if (license) licenses.set(usage.family.name, license);
      }),
  );
  const css = `${await fallbackFontFaceCss(registry, warnings)}${fontFaceCss(registry, licenses)}${documentCss(documentModel)}`;
  const language = escapeHtmlText(documentModel.locale);
  const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="color-scheme" content="light">
<meta name="generator" content="LWrite">
<title>${escapeHtmlText(documentModel.name.trim() || 'Untitled')}</title>
<style>
${css}</style>
</head>
<body>
<main class="lwrite-document" dir="auto">${body}</main>
</body>
</html>
`;
  return new Blob([html], { type: 'text/html' });
}

const SVG_PLACEHOLDER = 'lwrite-export-svg';
/** Tailwind classes TipTap writes on nodes; the exported stylesheet does not use them. */
const KEPT_CLASSES = new Set(['lwrite-graphic', 'lwrite-graphic-title']);

function buildBody(documentModel: ExportDocumentModel, warnings: WarningCollector, options: HtmlExportOptions): string {
  const parsed = new DOMParser().parseFromString(`<body>${documentModel.html}</body>`, 'text/html');
  const root = parsed.body;

  const images = new Map<string, ExportImageBlock>();
  const graphics = new Map<string, ExportGraphicBlock>();
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'image' && !images.has(block.src)) images.set(block.src, block);
    if (block.type === 'graphic' && block.model && block.scene) graphics.set(serializeSmartGraphic(block.model), block);
  });

  root.querySelectorAll('[contenteditable]').forEach((element) => element.removeAttribute('contenteditable'));
  root.querySelectorAll('[class]').forEach((element) => {
    const kept = Array.from(element.classList).filter((token) => KEPT_CLASSES.has(token));
    if (kept.length) element.setAttribute('class', kept.join(' '));
    else element.removeAttribute('class');
  });

  // Empty paragraphs are blank lines in the editor (ProseMirror adds a break).
  root.querySelectorAll('p, h1, h2, h3').forEach((element) => {
    if (!element.hasChildNodes()) element.appendChild(parsed.createElement('br'));
  });

  root.querySelectorAll('a[href]').forEach((anchor) => {
    anchor.setAttribute('rel', 'noopener noreferrer');
  });

  const dataUrls = new Map<string, string>();
  root.querySelectorAll('img').forEach((image) => {
    const src = image.getAttribute('src') ?? '';
    if (!src.startsWith('data:')) {
      const block = images.get(src);
      if (!block?.original) {
        // The file never loads anything from elsewhere: an image it could not
        // embed becomes its alt text, linked to the image's address.
        image.replaceWith(missingImage(parsed, src, block ?? { type: 'image', src, alt: image.getAttribute('alt') ?? '' }));
        return;
      }
      const { mimeType, bytes } = block.original;
      let url = dataUrls.get(src);
      if (!url) {
        url = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
        dataUrls.set(src, url);
      }
      image.setAttribute('src', url);
    }
    if (!image.hasAttribute('alt')) image.setAttribute('alt', '');
    if (!image.hasAttribute('data-align')) {
      const legacy = (image.getAttribute('align') ?? '').toLowerCase();
      image.setAttribute('data-align', legacy === 'left' || legacy === 'right' ? legacy : 'center');
    }
  });

  // The editor wraps tables in a scroll container; so does the export. Leading
  // header rows move into a `thead` so they can repeat on every printed page,
  // the way the other exporters repeat them (and the file keeps its semantics).
  // For paper, resized tables wider than the page scale to fit it, like the
  // PDF export's `resolveColumnWidths`.
  root.querySelectorAll('table').forEach((table) => {
    promoteHeaderRows(table);
    if (options.paper) fitTableToPaper(table, documentModel);
    const wrapper = parsed.createElement('div');
    wrapper.className = 'lwrite-table';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });

  const svgs: string[] = [];
  let simplified = false;
  root.querySelectorAll<HTMLElement>('div[data-lwrite-graphic], div[data-smart-diagram]').forEach((element) => {
    if (element.parentElement?.closest('[data-lwrite-graphic], [data-smart-diagram]')) return;
    const model = parseSmartGraphicJson(element.getAttribute('data-lwrite-graphic')) ?? parseSmartGraphicFromDom(element);
    const graphic = model ? graphics.get(serializeSmartGraphic(model)) : undefined;
    element.classList.add('lwrite-graphic');
    if (!graphic?.scene) {
      // The stored outline (title and nested lists) stays as the fallback.
      simplified = true;
      return;
    }
    const alt = graphicAltText(graphic);
    svgs.push(
      sceneToSvg(graphic.scene, {
        title: graphic.title.trim() || alt,
        description: alt,
        fontStack: (family) => `'${family}', ${cssGenericFamily(resolveFamily(family))}`,
        shadows: true,
        idPrefix: `lwg${svgs.length + 1}`,
        attributes: { class: 'lwrite-graphic-drawing', 'aria-label': alt },
      }),
    );
    // The model attribute keeps the graphic editable after re-import.
    element.replaceChildren(parsed.createElement(SVG_PLACEHOLDER));
  });
  if (simplified) warnings.add('graphic-layout-simplified');

  let index = 0;
  return root.innerHTML.replace(new RegExp(`<${SVG_PLACEHOLDER}></${SVG_PLACEHOLDER}>`, 'g'), () => {
    const svg = svgs[index] ?? '';
    index += 1;
    return svg;
  });
}

function missingImage(doc: Document, src: string, image: ExportImageBlock): HTMLElement {
  const paragraph = doc.createElement('p');
  const label = imagePlaceholderRuns(image)[0].text;
  if (/^https?:\/\//i.test(src)) {
    const link = doc.createElement('a');
    link.href = src;
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    paragraph.appendChild(link);
  } else {
    paragraph.textContent = label;
  }
  return paragraph;
}

/**
 * Moves the table's leading rows of header cells into a `thead`, so a printed
 * page that continues the table repeats them (the same rows the PDF export
 * repeats). A rowspan reaching past the header group would break the table
 * model, and a table of only header rows is not a header (as in the galley),
 * so both stay unchanged.
 */
function promoteHeaderRows(table: HTMLTableElement): void {
  const body = table.tBodies[0];
  if (!body) return;
  const rows = Array.from(body.rows);
  const cellsAreHeaders = (row: HTMLTableRowElement) => row.cells.length > 0 && Array.from(row.cells).every((cell) => cell.tagName === 'TH');
  const spansWithinGroup = (groupLength: number) =>
    rows.slice(0, groupLength).every((row, index) => Array.from(row.cells).every((cell) => cell.rowSpan <= groupLength - index));
  let count = 0;
  while (count < rows.length && cellsAreHeaders(rows[count])) {
    if (!spansWithinGroup(count + 1)) break;
    count += 1;
  }
  if (count === 0 || count === rows.length) return;
  const thead = (table.ownerDocument ?? document).createElement('thead');
  table.insertBefore(thead, body);
  for (let index = 0; index < count; index += 1) thead.appendChild(rows[index]);
}

/**
 * Scales a resized table that is wider than the printed page down to it, like
 * the PDF export's `resolveColumnWidths`: declared column widths keep their
 * proportions (flexible columns count the PDF's minimum), the table fills the
 * content width. Tables that already fit are left to the browser's `width:100%`.
 */
function fitTableToPaper(table: HTMLTableElement, documentModel: ExportDocumentModel): void {
  const contentWidth = pageGeometry(documentModel.locale).contentWidthPx;
  const columns = Array.from(table.querySelectorAll<HTMLElement>(':scope > colgroup > col'));
  if (!columns.length) return;
  const declaredWidth = (column: HTMLElement) =>
    column.style.width.endsWith('px') ? Number.parseFloat(column.style.width) : Number.NaN;
  const declared = columns.map(declaredWidth);
  const fixedTotal = declared.reduce((sum, width) => sum + (Number.isFinite(width) ? width : 0), 0);
  const flexible = declared.filter((width) => !Number.isFinite(width)).length;
  const minWidth = DOCUMENT_STYLE.table.minColumnWidth;
  const naturalWidth = flexible
    ? parseLengthPx(table.style.minWidth) ?? fixedTotal + flexible * minWidth
    : fixedTotal;
  if (naturalWidth <= contentWidth) return;
  const basisTotal = fixedTotal + flexible * minWidth;
  if (basisTotal <= 0) return;
  columns.forEach((column, index) => {
    const element = column as HTMLElement;
    const basis = Number.isFinite(declared[index]) ? (declared[index] as number) : minWidth;
    element.style.width = `${Math.round((basis / basisTotal) * 1000000) / 10000}%`;
    element.style.removeProperty('min-width');
  });
  table.style.width = '100%';
  table.style.removeProperty('min-width');
}

/** A `12px`-style length as a number, or null. */
function parseLengthPx(value: string): number | null {
  const px = Number.parseFloat(value);
  return value.endsWith('px') && Number.isFinite(px) && px > 0 ? px : null;
}


function unicodeRangeCss(ranges: UnicodeRange[]): string {
  return ranges
    .map(([low, high]) => {
      const start = low.toString(16).toUpperCase();
      return low === high ? `U+${start}` : `U+${start}-${high.toString(16).toUpperCase()}`;
    })
    .join(', ');
}

/**
 * `@font-face` rules for the bundled Noto Sans faces the document needs:
 * characters outside the self-hosted latin subsets would otherwise show in
 * whatever the reading system substitutes, while the PDF export draws them
 * with these files. Documents whose text the selected fonts cover embed none.
 */
async function fallbackFontFaceCss(registry: ExportFontRegistry, warnings: WarningCollector): Promise<string> {
  const rules = await Promise.all(
    registry.fallbackStyles().map(async ({ bold, italic, codePoints }) => {
      try {
        const bytes = await loadFallbackBytes(bold, italic);
        if (truetypeCovered(bytes, codePoints).size === 0) return '';
        const weight = bold ? 700 : 400;
        return `@font-face{font-family:'${FALLBACK_FAMILY}';font-style:${italic ? 'italic' : 'normal'};font-weight:${weight};src:url(data:font/ttf;base64,${bytesToBase64(bytes)}) format('truetype')}`;
      } catch {
        warnings.add('font-unavailable', FALLBACK_FAMILY);
        return '';
      }
    }),
  );
  return rules.length ? `${rules.join('\n')}\n` : '';
}

function isWoff2(bytes: Uint8Array): boolean {
  return bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
}

/**
 * `@font-face` rules for the files the document needs, as data URLs. Rules
 * for consecutive weights that share a file (one variable font declared per
 * weight) are merged into one weight range so the file is embedded once.
 */
function fontFaceCss(registry: ExportFontRegistry, licenses: Map<string, string>): string {
  const rules: string[] = [];
  registry.families.forEach((usage) => {
    const familyName = usage.family.name;
    const faces = registry.facesOf(familyName);
    if (!faces) return;
    const firstRule = rules.length;
    const files = new Map(registry.loadedFiles(familyName).map((file) => [file.sourceUrl, file.sourceBytes]));
    // Faces the text's weights select; each embedded rule must contain one.
    const used = new Set(Array.from(usage.weights.keys()).map((weight) => matchFontFace(faces, weight)?.face));
    const groups = new Map<string, { style: string; url: string; ranges: UnicodeRange[]; weights: WeightRange[] }>();
    faces.forEach((face) => {
      face.segments.forEach((segment) => {
        if (!files.has(segment.url)) return;
        const key = `${face.style}|${segment.url}`;
        const group = groups.get(key) ?? { style: face.style, url: segment.url, ranges: segment.ranges, weights: [] };
        group.weights.push({ low: face.weightMin, high: face.weightMax, used: used.has(face) });
        groups.set(key, group);
      });
    });
    groups.forEach((group) => {
      const bytes = files.get(group.url) as Uint8Array;
      const woff2 = isWoff2(bytes);
      const source = `url(data:${woff2 ? 'font/woff2' : 'font/ttf'};base64,${bytesToBase64(bytes)}) format('${woff2 ? 'woff2' : 'truetype'}')`;
      mergeWeightRanges(group.weights)
        .filter((range) => range.used)
        .forEach(({ low, high }) => {
          rules.push(
            `@font-face{font-family:'${familyName.replace(/'/g, '')}';font-style:${group.style};font-weight:${low === high ? low : `${low} ${high}`};src:${source};unicode-range:${unicodeRangeCss(group.ranges)};}`,
          );
        });
    });
    const license = licenses.get(familyName);
    if (license && rules.length > firstRule) rules.splice(firstRule, 0, `/*! ${familyName}\n\n${license.replace(/\*\//g, '* /')}\n*/`);
  });
  return rules.length ? `${rules.join('\n')}\n` : '';
}

interface WeightRange {
  low: number;
  high: number;
  used: boolean;
}

/**
 * Merges the weight ranges of faces declared consecutively for one file
 * (400, 500, 600 → 400 600), so the file is embedded once; faces with a gap
 * between them (Inter's 400 and 700) stay separate, as the browser would
 * pick a different face for weights in the gap.
 */
function mergeWeightRanges(ranges: WeightRange[]): WeightRange[] {
  const sorted = ranges.slice().sort((a, b) => a.low - b.low);
  const merged: WeightRange[] = [];
  sorted.forEach((range) => {
    const last = merged[merged.length - 1];
    if (last && range.low <= last.high + 100) {
      last.high = Math.max(last.high, range.high);
      last.used ||= range.used;
    } else merged.push({ ...range });
  });
  return merged;
}

// The bundled fallback sits before the system fonts, so characters the
// self-hosted subsets lack use the same glyphs the PDF export draws.
const SANS_STACK = `'${FALLBACK_FAMILY}', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const MONO_STACK = `'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', '${FALLBACK_FAMILY}', monospace`;

/**
 * The editor's document styles (`.prose` and `src/index.css`), resolved for
 * the light theme, with the same numbers the other exporters use. The
 * responsive blocks are screen-only, so the print layout always uses the
 * page's own geometry, and the print block carries the pagination rules the
 * PDF export implements (orphans and widows, headings kept with what follows,
 * repeating header rows, backgrounds preserved) plus the page's maximum
 * image heights the PDF scales to.
 */
function documentCss(documentModel: ExportDocumentModel): string {
  const s = DOCUMENT_STYLE;
  const text = `#${s.color}`;
  const muted = `#${s.mutedColor}`;
  const border = `#${s.borderColor}`;
  const geometry = pageGeometry(documentModel.locale);
  const h = s.headings;
  /** Prose sizes these in em, so they scale inside 14px table cells as in the editor. */
  const em = (px: number) => `${Math.round((px / s.sizePx) * 10000) / 10000}em`;
  // The PDF export scales an image down once it would not fit a page's
  // content area; the same ceiling in print keeps the image on one page
  // instead of clipping it, and `object-fit` keeps long narrow images from
  // stretching when an explicit width pins the box wider than the ceiling.
  const imageCeilingPx = geometry.contentHeightPt / PX_TO_PT - s.image.margin * 2;
  const graphicCeilingPx = geometry.contentHeightPt / PX_TO_PT - s.graphic.margin * 2 - (s.graphic.padding + s.graphic.borderWidth) * 2;
  return `*,::before,::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;background:#fff}
body{margin:0;background:#fff;color:${text};font-family:'${s.family}', ${SANS_STACK};font-size:${s.sizePx}px;line-height:${s.lineHeight};-webkit-font-smoothing:antialiased}
.lwrite-document{max-width:${EDITOR_COLUMN_WIDTH + 112}px;margin:0 auto;padding:40px 56px;overflow-wrap:anywhere;white-space:break-spaces;font-variant-ligatures:none;font-feature-settings:"liga" 0}
.lwrite-document>:first-child{margin-top:0}
.lwrite-document>:last-child{margin-bottom:0}
p{margin:${s.paragraph.marginTop / 16}em 0 ${s.paragraph.marginBottom}px;line-height:${s.lineHeight}}
h1,h2,h3{color:${text};margin:0}
h1{font-size:${h[1].sizePx}px;font-weight:${h[1].weight};line-height:${h[1].lineHeight};margin:${h[1].marginTop}px 0 ${h[1].marginBottom}px}
h2{font-size:${h[2].sizePx}px;font-weight:${h[2].weight};line-height:${h[2].lineHeight};margin:${h[2].marginTop}px 0 ${h[2].marginBottom}px}
h3{font-size:${h[3].sizePx}px;font-weight:${h[3].weight};line-height:${h[3].lineHeight};margin:${h[3].marginTop}px 0 ${h[3].marginBottom}px}
:is(h1,h2,h3)[style*=color i]{color:${text}!important}
h1 strong{font-weight:${h[1].strongWeight}}
h2 strong{font-weight:${h[2].strongWeight}}
h3 strong{font-weight:${h[3].strongWeight}}
:is(h2,h3,hr)+:is(p,ul,ol,blockquote,pre,hr){margin-top:0}
strong,b{font-weight:${s.strongWeight};color:inherit}
a{color:#${s.linkColor};text-decoration:underline;text-underline-offset:3px;font-weight:${s.linkWeight}}
a strong{color:inherit}
mark{border-radius:${s.mark.radius}px;padding:${s.mark.paddingY}px ${s.mark.paddingX}px}
sub,sup{font-size:${s.script.scale * 100}%;line-height:0;position:relative;vertical-align:baseline}
sub{bottom:-${s.script.subShift}em}
sup{top:-${s.script.superShift}em}
code{font-family:${MONO_STACK};font-size:${s.inlineCode.scale}em;font-weight:${s.inlineCode.weight};color:${text}}
:is(a,h1,h2,h3,blockquote) code{color:inherit}
pre{font-family:${MONO_STACK};font-size:${em(s.codeBlock.sizePx)};line-height:${s.codeBlock.lineHeightPx / s.codeBlock.sizePx};margin:${s.codeBlock.margin / s.codeBlock.sizePx}em 0;padding:${s.codeBlock.paddingY / s.codeBlock.sizePx}em ${s.codeBlock.paddingX / s.codeBlock.sizePx}em;border-radius:${s.codeBlock.radius}px;background:#${s.codeBlock.background};color:${text};font-weight:400;overflow-x:auto;white-space:pre-wrap}
pre code{font:inherit;color:inherit;background:none;padding:0}
blockquote{margin:${em(s.blockquote.margin)} 0;padding-inline-start:${s.blockquote.paddingLeft}px;border-inline-start:${s.blockquote.borderWidth}px solid ${border};font-weight:${s.blockquote.weight};font-style:italic;color:${text}}
blockquote strong{color:inherit}
hr{height:0;margin:${em(s.rule.margin)} 0;border:0;border-top:${s.rule.width}px solid ${border}}
ul,ol{margin:${em(s.list.marginTop)} 0 ${s.list.marginBottom}px;padding-inline-start:${s.list.indent}px}
ul{list-style-type:disc}
ol{list-style-type:decimal}
ul ul{list-style-type:circle}
ul ul ul{list-style-type:square}
:is(ul,ol) :is(ul,ol){margin-top:${em(s.list.nestedMarginTop)};margin-bottom:${s.list.nestedMarginBottom}px}
li{margin:${em(s.list.itemMarginTop)} 0 ${em(s.list.itemMarginBottom)};padding-inline-start:${s.list.itemPadding}px}
li::marker{color:${muted};font-weight:400}
.lwrite-document li>p{margin:0}
.lwrite-document li>p+p{margin-top:${em(s.list.itemParagraphGap)}}
img{display:block;max-width:100%;height:auto;border-radius:${s.image.radius}px}
img[data-align=center]{margin:${s.image.margin}px auto}
img[data-align=left]{float:left;margin:${s.image.floatMargin}px ${s.image.floatGap}px ${s.image.floatMargin}px 0}
img[data-align=right]{float:right;margin:${s.image.floatMargin}px 0 ${s.image.floatMargin}px ${s.image.floatGap}px}
.lwrite-table{margin:${s.table.margin}px 0;overflow-x:auto;max-width:100%}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;font-size:${em(s.table.sizePx)};line-height:${s.table.lineHeight};background:#${s.table.cellBackground}}
th,td{min-width:${s.table.minColumnWidth}px;border:${s.table.borderWidth}px solid ${border};padding:${s.table.cellPaddingY}px ${s.table.cellPaddingX}px;vertical-align:top;text-align:start;background-color:#${s.table.cellBackground}}
th{background-color:#${s.table.headerBackground};font-weight:${s.table.headerWeight}}
:is(th,td) p{margin:${em(s.paragraph.marginTop)} 0 ${s.table.paragraphMarginBottom}px}
.lwrite-document :is(th,td)>:first-child{margin-top:0}
.lwrite-document :is(th,td)>:last-child{margin-bottom:0}
table[data-borders=hidden] :is(th,td){border-color:transparent}
div.lwrite-graphic{margin:${s.graphic.margin}px 0;padding:${s.graphic.padding}px;border:${s.graphic.borderWidth}px solid #${s.graphic.borderColor};border-radius:${s.graphic.radius}px;background:#${s.graphic.background};overflow-x:auto}
.lwrite-graphic-title{font-weight:600;margin:0 0 8px}
svg.lwrite-graphic-drawing{display:block;width:100%;max-width:100%;height:auto;margin:0 auto;white-space:pre;direction:${documentModel.direction}}
@media screen and (max-width:639px){
.lwrite-document{padding:20px 16px 32px}
h1{font-size:28px;margin-top:24px}
h2{font-size:22.4px;margin-top:22px}
h3{font-size:18.4px;margin-top:20px}
table{table-layout:auto}
:is(th,td){min-width:88px}
div.lwrite-graphic{padding:12px 10px}
}
@media screen and (max-width:479px){
img:is([data-align=left],[data-align=right]):is([data-width='75'],[data-width='100']){float:none;margin:16px auto}
}
@page{size:${geometry.widthPt}pt ${geometry.heightPt}pt;margin:${geometry.marginPt}pt}
@media print{
/* The paper carries the document's own tones: the PDF export always draws
   table shading, code marks and highlights, so exact printing does not
   depend on the browser's background-graphics switch. */
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lwrite-document{max-width:none;padding:0}
/* Paragraphs and code blocks break like the PDF's orphans and widows rule:
   at least two lines stay on either side of a page break, inside code like
   inside prose. */
p,li,pre{orphans:2;widows:2}
:is(h1,h2,h3){break-after:avoid}
:is(img,tr,div.lwrite-graphic){break-inside:avoid}
/* A row taller than the page fragments like the PDF's split rows; the
   print preparation marks them after measuring. */
tr[data-lwrite-breakable]{break-inside:auto}
.lwrite-table,div.lwrite-graphic,pre{overflow:visible}
img{max-height:${Math.round(imageCeilingPx * 100) / 100}px;object-fit:contain}
svg.lwrite-graphic-drawing{max-height:${Math.round(graphicCeilingPx * 100) / 100}px}
}
`;
}
