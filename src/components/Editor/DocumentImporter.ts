import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import {
  assertDocumentSize,
  MAX_DOCUMENT_BYTES,
  sanitizeDocumentWithinLimit,
} from '@/lib/documentLimits';
import { openDocumentArchive } from '@/lib/documentArchive';

export type SupportedFormat = 'txt' | 'html' | 'htm' | 'rtf' | 'docx' | 'odt' | 'ott' | 'fodt';

export interface ImportResult {
  content: string;
  fileName: string;
  format: SupportedFormat;
}

const SUPPORTED_FORMATS: SupportedFormat[] = [
  'txt',
  'html',
  'htm',
  'rtf',
  'docx',
  'odt',
  'ott',
  'fodt',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, ' ');
}

function textToParagraphHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const normalized = lines.length ? lines : [''];
  return normalized.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

function detectFormat(file: File): SupportedFormat {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && SUPPORTED_FORMATS.includes(extension as SupportedFormat)) {
    return extension as SupportedFormat;
  }

  const mime = file.type.toLowerCase();
  if (mime.includes('wordprocessingml.document')) return 'docx';
  if (mime.includes('opendocument.text')) return 'odt';
  if (mime.includes('rtf')) return 'rtf';
  if (mime.includes('html')) return 'html';

  if (extension && extension !== 'txt' && mime !== 'text/plain') {
    throw new Error('Unsupported document format.');
  }

  return 'txt';
}

// Import DOCX using mammoth
async function importDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth').then((module) => module.default);
  const zip = await openDocumentArchive(await file.arrayBuffer());
  // Mammoth receives only bounded, already inflated entries, including media
  // and auxiliary XML. A post-conversion assertion alone would be too late.
  const arrayBuffer = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'STORE',
  });
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement((image) => {
        return image.read('base64').then((imageBuffer) => {
          return {
            src: `data:${image.contentType};base64,${imageBuffer}`,
          };
        });
      }),
    },
  );
  assertDocumentSize(result.value);
  return result.value;
}

type OdtImageResolver = (href: string) => Promise<string | null>;

function getXmlAttribute(element: Element, ...names: string[]): string {
  for (const name of names) {
    const value = element.getAttribute(name);
    if (value) return value;
  }
  return '';
}

function clampHeadingLevel(value: string): 1 | 2 | 3 {
  const level = Number.parseInt(value, 10);
  if (level === 1 || level === 2 || level === 3) return level;
  return 3;
}

function getElementChildren(element: ParentNode, tagName?: string): Element[] {
  return Array.from(element.childNodes).filter((child): child is Element => {
    if (child.nodeType !== Node.ELEMENT_NODE) return false;
    return !tagName || (child as Element).tagName.toLowerCase() === tagName;
  });
}

function inferImageMimeType(path: string): string {
  const clean = path.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

interface OdtTextStyle {
  bold?: boolean;
  italic?: boolean;
}

/**
 * Bold/italic for each named style, following `style:parent-style-name`.
 * LibreOffice puts emphasis in automatic text styles (`T1`, `T2`…) whose
 * names say nothing about the formatting.
 */
function collectOdtTextStyles(doc: Document): Map<string, OdtTextStyle> {
  const declared = new Map<string, { style: OdtTextStyle; parent?: string }>();
  Array.from(doc.getElementsByTagName('style:style')).forEach((style) => {
    const name = getXmlAttribute(style, 'style:name').toLowerCase();
    if (!name) return;
    const properties = getElementChildren(style).find(
      (child) => child.tagName.toLowerCase() === 'style:text-properties',
    );
    const own: OdtTextStyle = {};
    if (properties) {
      const weight = getXmlAttribute(properties, 'fo:font-weight').toLowerCase();
      const numericWeight = Number.parseInt(weight, 10);
      if (weight === 'bold' || numericWeight >= 600) own.bold = true;
      else if (weight === 'normal' || weight === 'lighter' || (weight && numericWeight < 600))
        own.bold = false;
      const fontStyle = getXmlAttribute(properties, 'fo:font-style').toLowerCase();
      if (fontStyle === 'italic' || fontStyle === 'oblique') own.italic = true;
      else if (fontStyle === 'normal') own.italic = false;
    }
    declared.set(name, {
      style: own,
      parent: getXmlAttribute(style, 'style:parent-style-name').toLowerCase() || undefined,
    });
  });
  const resolved = new Map<string, OdtTextStyle>();
  const resolve = (name: string, seen: Set<string>): OdtTextStyle => {
    const cached = resolved.get(name);
    if (cached) return cached;
    const entry = declared.get(name);
    if (!entry || seen.has(name)) return {};
    seen.add(name);
    const merged = {
      ...(entry.parent ? resolve(entry.parent, seen) : {}),
      ...entry.style,
    };
    resolved.set(name, merged);
    return merged;
  };
  declared.forEach((_entry, name) => resolve(name, new Set()));
  return resolved;
}

async function processOdtInlineNode(
  node: Node,
  resolveImage?: OdtImageResolver,
  textStyles?: Map<string, OdtTextStyle>,
): Promise<string> {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'text:line-break') return '<br>';
  // The editor has no tab stops; non-breaking spaces keep the tab's gap
  // instead of letting HTML collapse it to a single space.
  if (tagName === 'text:tab') return '&nbsp;'.repeat(4);
  if (tagName === 'text:s') {
    const count = Math.max(
      1,
      Math.min(100, Number.parseInt(element.getAttribute('text:c') ?? '1', 10) || 1),
    );
    return '&nbsp;'.repeat(count);
  }
  if (tagName === 'draw:frame') {
    return processOdtImageFrame(element, resolveImage);
  }

  const content = (
    await Promise.all(
      Array.from(element.childNodes).map((child) =>
        processOdtInlineNode(child, resolveImage, textStyles),
      ),
    )
  ).join('');

  if (tagName === 'text:span') {
    const styleName = getXmlAttribute(element, 'text:style-name').toLowerCase();
    const style = textStyles?.get(styleName);
    // Documents without style definitions keep the name-based fallback.
    const bold = style?.bold ?? styleName.includes('bold');
    const italic = style?.italic ?? styleName.includes('italic');
    const withBold = bold ? `<strong>${content}</strong>` : content;
    return italic ? `<em>${withBold}</em>` : withBold;
  }

  if (tagName === 'text:a') {
    const href = getXmlAttribute(element, 'xlink:href', 'href');
    return href ? `<a href="${escapeHtmlAttribute(href)}">${content}</a>` : content;
  }

  return content;
}

async function processOdtImageFrame(
  frame: Element,
  resolveImage?: OdtImageResolver,
): Promise<string> {
  const image = getElementChildren(frame).find(
    (child) => child.tagName.toLowerCase() === 'draw:image',
  );
  const href = image ? getXmlAttribute(image, 'xlink:href', 'href') : '';
  if (!href) return '';

  const resolved = resolveImage ? await resolveImage(href) : href;
  if (!resolved) return '';

  const alt = getXmlAttribute(frame, 'draw:name', 'svg:title') || 'Image';
  return `<img src="${escapeHtmlAttribute(resolved)}" alt="${escapeHtmlAttribute(alt)}">`;
}

/**
 * Whether each `text:list-style` in the document is numbered, by style name.
 * LibreOffice names list styles `L1`, `L2`…, so the name alone says nothing
 * about numbering; the level style does.
 */
function collectOdtListStyles(doc: Document): Map<string, boolean> {
  const styles = new Map<string, boolean>();
  Array.from(doc.getElementsByTagName('text:list-style')).forEach((style) => {
    const name = getXmlAttribute(style, 'style:name').toLowerCase();
    if (!name) return;
    const firstLevel = getElementChildren(style).find((child) =>
      child.tagName.toLowerCase().startsWith('text:list-level-style-'),
    );
    if (firstLevel) {
      styles.set(name, firstLevel.tagName.toLowerCase() === 'text:list-level-style-number');
    }
  });
  return styles;
}

async function processOdtBlocks(
  parent: ParentNode,
  resolveImage?: OdtImageResolver,
  listStyles?: Map<string, boolean>,
  textStyles?: Map<string, OdtTextStyle>,
): Promise<string> {
  const parts: string[] = [];

  for (const child of getElementChildren(parent)) {
    const tagName = child.tagName.toLowerCase();

    if (tagName === 'text:p') {
      parts.push(`<p>${await processOdtInlineNode(child, resolveImage, textStyles)}</p>`);
    } else if (tagName === 'text:h') {
      const level = clampHeadingLevel(getXmlAttribute(child, 'text:outline-level'));
      parts.push(
        `<h${level}>${await processOdtInlineNode(child, resolveImage, textStyles)}</h${level}>`,
      );
    } else if (tagName === 'text:list') {
      parts.push(await processOdtList(child, resolveImage, listStyles, textStyles));
    } else if (tagName === 'table:table') {
      parts.push(await processOdtTable(child, resolveImage, listStyles, textStyles));
    } else if (tagName === 'draw:frame') {
      parts.push(`<p>${await processOdtImageFrame(child, resolveImage)}</p>`);
    } else {
      parts.push(await processOdtBlocks(child, resolveImage, listStyles, textStyles));
    }
  }

  return parts.join('');
}

async function processOdtList(
  element: Element,
  resolveImage?: OdtImageResolver,
  listStyles?: Map<string, boolean>,
  textStyles?: Map<string, OdtTextStyle>,
): Promise<string> {
  const styleName = getXmlAttribute(element, 'text:style-name').toLowerCase();
  // Fall back to the style name for documents without a list-style definition.
  const ordered =
    listStyles?.get(styleName) ?? (styleName.includes('number') || styleName.includes('ordered'));
  const listTag = ordered ? 'ol' : 'ul';
  const items = getElementChildren(element, 'text:list-item');
  const firstStart = Number.parseInt(getXmlAttribute(items[0] ?? element, 'text:start-value'), 10);
  const start =
    ordered && Number.isFinite(firstStart) && firstStart > 1 ? ` start="${firstStart}"` : '';
  const body = (
    await Promise.all(
      items.map(async (item) => {
        const itemStart = Number.parseInt(getXmlAttribute(item, 'text:start-value'), 10);
        const value =
          ordered && Number.isFinite(itemStart) && itemStart > 0 ? ` value="${itemStart}"` : '';
        return `<li${value}>${await processOdtBlocks(item, resolveImage, listStyles, textStyles)}</li>`;
      }),
    )
  ).join('');

  return `<${listTag}${start}>${body}</${listTag}>`;
}

/** All rows of a table, including rows inside header and row-group wrappers. */
function collectOdtTableRows(element: Element): Element[] {
  const rows: Element[] = [];
  getElementChildren(element).forEach((child) => {
    const tagName = child.tagName.toLowerCase();
    if (tagName === 'table:table-row') {
      rows.push(child);
    } else if (
      tagName === 'table:table-header-rows' ||
      tagName === 'table:table-rows' ||
      tagName === 'table:table-row-group'
    ) {
      rows.push(...collectOdtTableRows(child));
    }
  });
  return rows;
}

async function processOdtTable(
  element: Element,
  resolveImage?: OdtImageResolver,
  listStyles?: Map<string, boolean>,
  textStyles?: Map<string, OdtTextStyle>,
): Promise<string> {
  const rows = collectOdtTableRows(element);
  const body = (
    await Promise.all(
      rows.map(async (row) => {
        const cells = getElementChildren(row).filter(
          (cell) => cell.tagName.toLowerCase() === 'table:table-cell',
        );
        const cellHtml = (
          await Promise.all(
            cells.map(async (cell) => {
              const colSpan = Number.parseInt(
                getXmlAttribute(cell, 'table:number-columns-spanned'),
                10,
              );
              const rowSpan = Number.parseInt(
                getXmlAttribute(cell, 'table:number-rows-spanned'),
                10,
              );
              const attrs = [
                Number.isFinite(colSpan) && colSpan > 1 ? ` colspan="${colSpan}"` : '',
                Number.isFinite(rowSpan) && rowSpan > 1 ? ` rowspan="${rowSpan}"` : '',
              ].join('');
              return `<td${attrs}>${await processOdtBlocks(cell, resolveImage, listStyles, textStyles)}</td>`;
            }),
          )
        ).join('');
        return `<tr>${cellHtml}</tr>`;
      }),
    )
  ).join('');

  return `<table>${body}</table>`;
}

/**
 * A tiny XML node can request billions of spaces, independently of ZIP size.
 * Bound the cumulative expansion before any repeat() or parallel conversion.
 * Each space becomes `&nbsp;` (six characters), and each element is clamped
 * to 100 spaces, so measure the markup actually produced, not the request.
 */
export function assertOdtSpaceExpansion(officeText: Element, limit = MAX_DOCUMENT_BYTES): void {
  let expanded = 0;
  for (const element of Array.from(officeText.getElementsByTagName('text:s'))) {
    const count = Math.max(
      1,
      Math.min(100, Number.parseInt(getXmlAttribute(element, 'text:c'), 10) || 1),
    );
    expanded += count * '&nbsp;'.length;
    if (!Number.isSafeInteger(expanded) || expanded > limit)
      throw new Error('Expanded document exceeds the size limit.');
  }
}

async function convertOdtXmlToHtml(
  doc: Document,
  resolveImage?: OdtImageResolver,
): Promise<string> {
  const officeText = doc.getElementsByTagName('office:text')[0];
  if (doc.querySelector('parsererror') || !officeText) throw new Error('Invalid OpenDocument XML.');
  assertOdtSpaceExpansion(officeText);
  const html = await processOdtBlocks(
    officeText,
    resolveImage,
    collectOdtListStyles(doc),
    collectOdtTextStyles(doc),
  );
  return html || '<p></p>';
}

// Import ODT (OpenDocument Text)
async function importOdt(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const zipFile = await openDocumentArchive(arrayBuffer);

  const contentXml = await zipFile.file('content.xml')?.async('string');
  if (!contentXml) {
    throw new Error('Invalid ODT file');
  }
  assertDocumentSize(contentXml);

  const parser = new DOMParser();
  const doc = parser.parseFromString(contentXml, 'text/xml');
  return convertOdtXmlToHtml(doc, async (href) => {
    const fileEntry = zipFile.file(href);
    if (!fileEntry) return null;
    const base64 = await fileEntry.async('base64');
    return `data:${inferImageMimeType(href)};base64,${base64}`;
  });
}

// Import FODT (Flat OpenDocument Text) - basic support
async function importFodt(file: File): Promise<string> {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  return convertOdtXmlToHtml(doc);
}

const SKIPPED_RTF_DESTINATIONS = new Set([
  'author',
  'colortbl',
  'comment',
  'datastore',
  'fonttbl',
  'footer',
  'generator',
  'header',
  'info',
  'listoverridetable',
  'listtable',
  'object',
  'pict',
  'stylesheet',
  'subject',
  'title',
]);

function readRtfGroupDestination(value: string, index: number): { skip: boolean } {
  let cursor = index;
  if (value[cursor] !== '\\') return { skip: false };
  cursor += 1;

  let ignorable = false;
  if (value[cursor] === '*') {
    ignorable = true;
    cursor += 1;
    if (value[cursor] === '\\') cursor += 1;
  }

  const match = value.slice(cursor).match(/^[a-zA-Z]+/);
  const word = match?.[0].toLowerCase() ?? '';
  return { skip: ignorable || SKIPPED_RTF_DESTINATIONS.has(word) };
}

function rtfUnicodeCharacter(value: number): string {
  return String.fromCharCode(value < 0 ? value + 0x10000 : value);
}

/**
 * Skips the ANSI fallback after `\uN`. `\ucN` counts characters, and one
 * fallback character may be written as a `\'hh` escape or a control symbol,
 * so counting raw source characters would leave `'hh` fragments in the text.
 */
function skipRtfFallback(value: string, index: number, count: number): number {
  let cursor = index;
  for (let skipped = 0; skipped < count && cursor < value.length; skipped += 1) {
    if (value[cursor] === '\\') {
      if (value[cursor + 1] === "'") {
        cursor += 4;
      } else {
        const control = value.slice(cursor + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/);
        cursor += control ? 1 + control[0].length : 2;
      }
    } else {
      cursor += 1;
    }
  }
  return cursor;
}

function convertRtfToText(value: string): string {
  const groupStack: boolean[] = [false];
  let output = '';
  let cursor = 0;
  let unicodeFallbackLength = 1;

  const isSkipping = () => groupStack[groupStack.length - 1] ?? false;

  while (cursor < value.length) {
    const char = value[cursor];

    if (char === '{') {
      const destination = readRtfGroupDestination(value, cursor + 1);
      groupStack.push(isSkipping() || destination.skip);
      cursor += 1;
      continue;
    }

    if (char === '}') {
      if (groupStack.length > 1) groupStack.pop();
      cursor += 1;
      continue;
    }

    if (isSkipping()) {
      cursor += 1;
      continue;
    }

    if (char !== '\\') {
      if (char !== '\r' && char !== '\n') {
        output += char;
      }
      cursor += 1;
      continue;
    }

    const next = value[cursor + 1];
    if (next === '\\' || next === '{' || next === '}') {
      output += next;
      cursor += 2;
      continue;
    }
    if (next === '~') {
      output += '\u00a0';
      cursor += 2;
      continue;
    }
    if (next === '-') {
      cursor += 2;
      continue;
    }
    if (next === '_') {
      output += '\u2011';
      cursor += 2;
      continue;
    }
    if (next === "'") {
      const hex = value.slice(cursor + 2, cursor + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        output += String.fromCharCode(Number.parseInt(hex, 16));
        cursor += 4;
        continue;
      }
    }

    const control = value.slice(cursor + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/);
    if (!control) {
      cursor += 2;
      continue;
    }

    const word = control[1].toLowerCase();
    const numeric = control[2] ? Number.parseInt(control[2], 10) : undefined;
    let nextCursor = cursor + 1 + control[0].length;

    if (word === 'par' || word === 'line') {
      output += '\n';
    } else if (word === 'tab') {
      output += '\t';
    } else if (word === 'emdash') {
      output += '\u2014';
    } else if (word === 'endash') {
      output += '\u2013';
    } else if (word === 'bullet') {
      output += '\u2022';
    } else if (word === 'uc' && typeof numeric === 'number') {
      unicodeFallbackLength = Math.max(0, Math.min(8, numeric));
    } else if (word === 'u' && typeof numeric === 'number') {
      output += rtfUnicodeCharacter(numeric);
      nextCursor = skipRtfFallback(value, nextCursor, unicodeFallbackLength);
    }

    cursor = nextCursor;
  }

  return output.replace(/\n{3,}/g, '\n\n').trim();
}

// RTF import intentionally extracts readable text instead of preserving layout.
function importRtf(text: string): string {
  return textToParagraphHtml(convertRtfToText(text));
}

// Main import function
export async function importDocument(file: File): Promise<ImportResult> {
  assertDocumentSize(file);

  const fileName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Untitled';
  const format = detectFormat(file);

  const content: string = await (async () => {
    switch (format) {
      case 'docx':
        return importDocx(file);
      case 'odt':
      case 'ott':
        return importOdt(file);
      case 'fodt':
        return importFodt(file);
      case 'html':
      case 'htm':
        return sanitizeDocumentHtml(await file.text());
      case 'rtf':
        return importRtf(await file.text());
      case 'txt':
      default:
        return textToParagraphHtml(await file.text());
    }
  })();

  assertDocumentSize(content);
  return {
    content: sanitizeDocumentWithinLimit(content),
    fileName,
    format,
  };
}

export function getSupportedFormats(): string {
  return '.txt,.html,.htm,.rtf,.docx,.odt,.ott,.fodt';
}
