import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';

export type SupportedFormat =
  | 'txt'
  | 'html'
  | 'htm'
  | 'rtf'
  | 'docx'
  | 'odt'
  | 'ott'
  | 'fodt';

export interface ImportResult {
  content: string;
  fileName: string;
  format: SupportedFormat;
}

const SUPPORTED_FORMATS: SupportedFormat[] = ['txt', 'html', 'htm', 'rtf', 'docx', 'odt', 'ott', 'fodt'];
const MAX_IMPORT_SIZE_MB = 20;

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

  return 'txt';
}

// Import DOCX using mammoth
async function importDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth').then((module) => module.default);
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    convertImage: mammoth.images.imgElement((image) => {
      return image.read("base64").then((imageBuffer) => {
        return {
          src: `data:${image.contentType};base64,${imageBuffer}`,
        };
      });
    }),
  });
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

async function processOdtInlineNode(node: Node, resolveImage?: OdtImageResolver): Promise<string> {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'text:line-break') return '<br>';
  if (tagName === 'text:tab') return '    ';
  if (tagName === 'text:s') {
    const count = Math.max(1, Math.min(100, Number.parseInt(element.getAttribute('text:c') ?? '1', 10) || 1));
    return '&nbsp;'.repeat(count);
  }
  if (tagName === 'draw:frame') {
    return processOdtImageFrame(element, resolveImage);
  }

  const content = (await Promise.all(Array.from(element.childNodes).map((child) => processOdtInlineNode(child, resolveImage)))).join('');

  if (tagName === 'text:span') {
    const styleName = getXmlAttribute(element, 'text:style-name').toLowerCase();
    const withBold = styleName.includes('bold') ? `<strong>${content}</strong>` : content;
    return styleName.includes('italic') ? `<em>${withBold}</em>` : withBold;
  }

  if (tagName === 'text:a') {
    const href = getXmlAttribute(element, 'xlink:href', 'href');
    return href ? `<a href="${escapeHtmlAttribute(href)}">${content}</a>` : content;
  }

  return content;
}

async function processOdtImageFrame(frame: Element, resolveImage?: OdtImageResolver): Promise<string> {
  const image = getElementChildren(frame).find((child) => child.tagName.toLowerCase() === 'draw:image');
  const href = image ? getXmlAttribute(image, 'xlink:href', 'href') : '';
  if (!href) return '';

  const resolved = resolveImage ? await resolveImage(href) : href;
  if (!resolved) return '';

  const alt = getXmlAttribute(frame, 'draw:name', 'svg:title') || 'Image';
  return `<img src="${escapeHtmlAttribute(resolved)}" alt="${escapeHtmlAttribute(alt)}">`;
}

async function processOdtBlocks(parent: ParentNode, resolveImage?: OdtImageResolver): Promise<string> {
  const parts: string[] = [];

  for (const child of getElementChildren(parent)) {
    const tagName = child.tagName.toLowerCase();

    if (tagName === 'text:p') {
      parts.push(`<p>${await processOdtInlineNode(child, resolveImage)}</p>`);
    } else if (tagName === 'text:h') {
      const level = clampHeadingLevel(getXmlAttribute(child, 'text:outline-level'));
      parts.push(`<h${level}>${await processOdtInlineNode(child, resolveImage)}</h${level}>`);
    } else if (tagName === 'text:list') {
      parts.push(await processOdtList(child, resolveImage));
    } else if (tagName === 'table:table') {
      parts.push(await processOdtTable(child, resolveImage));
    } else if (tagName === 'draw:frame') {
      parts.push(`<p>${await processOdtImageFrame(child, resolveImage)}</p>`);
    } else {
      parts.push(await processOdtBlocks(child, resolveImage));
    }
  }

  return parts.join('');
}

async function processOdtList(element: Element, resolveImage?: OdtImageResolver): Promise<string> {
  const styleName = getXmlAttribute(element, 'text:style-name').toLowerCase();
  const ordered = styleName.includes('number') || styleName.includes('ordered');
  const listTag = ordered ? 'ol' : 'ul';
  const items = getElementChildren(element, 'text:list-item');
  const firstStart = Number.parseInt(getXmlAttribute(items[0] ?? element, 'text:start-value'), 10);
  const start = ordered && Number.isFinite(firstStart) && firstStart > 1 ? ` start="${firstStart}"` : '';
  const body = (
    await Promise.all(
      items.map(async (item) => {
        const itemStart = Number.parseInt(getXmlAttribute(item, 'text:start-value'), 10);
        const value = ordered && Number.isFinite(itemStart) && itemStart > 0 ? ` value="${itemStart}"` : '';
        return `<li${value}>${await processOdtBlocks(item, resolveImage)}</li>`;
      }),
    )
  ).join('');

  return `<${listTag}${start}>${body}</${listTag}>`;
}

async function processOdtTable(element: Element, resolveImage?: OdtImageResolver): Promise<string> {
  const rows = getElementChildren(element, 'table:table-row');
  const body = (
    await Promise.all(
      rows.map(async (row) => {
        const cells = getElementChildren(row).filter((cell) => cell.tagName.toLowerCase() === 'table:table-cell');
        const cellHtml = (
          await Promise.all(
            cells.map(async (cell) => {
              const colSpan = Number.parseInt(getXmlAttribute(cell, 'table:number-columns-spanned'), 10);
              const rowSpan = Number.parseInt(getXmlAttribute(cell, 'table:number-rows-spanned'), 10);
              const attrs = [
                Number.isFinite(colSpan) && colSpan > 1 ? ` colspan="${colSpan}"` : '',
                Number.isFinite(rowSpan) && rowSpan > 1 ? ` rowspan="${rowSpan}"` : '',
              ].join('');
              return `<td${attrs}>${await processOdtBlocks(cell, resolveImage)}</td>`;
            }),
          )
        ).join('');
        return `<tr>${cellHtml}</tr>`;
      }),
    )
  ).join('');

  return `<table>${body}</table>`;
}

async function convertOdtXmlToHtml(doc: Document, resolveImage?: OdtImageResolver): Promise<string> {
  const officeText = doc.getElementsByTagName('office:text')[0] ?? doc.documentElement;
  const html = await processOdtBlocks(officeText, resolveImage);
  return html || '<p></p>';
}

// Import ODT (OpenDocument Text)
async function importOdt(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const JSZip = await import('jszip').then((module) => module.default);
    const zipFile = await JSZip.loadAsync(arrayBuffer);
    
    const contentXml = await zipFile.file('content.xml')?.async('string');
    if (!contentXml) {
      throw new Error('Invalid ODT file');
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(contentXml, 'text/xml');
    return convertOdtXmlToHtml(doc, async (href) => {
      const fileEntry = zipFile.file(href);
      if (!fileEntry) return null;
      const base64 = await fileEntry.async('base64');
      return `data:${inferImageMimeType(href)};base64,${base64}`;
    });
  } catch (error) {
    console.error('ODT import error:', error);
    const text = await file.text();
    return textToParagraphHtml(text);
  }
}

// Import FODT (Flat OpenDocument Text) - basic support
async function importFodt(file: File): Promise<string> {
  try {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    return convertOdtXmlToHtml(doc);
  } catch (error) {
    console.error('FODT import error:', error);
    const text = await file.text();
    return textToParagraphHtml(text);
  }
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
      nextCursor += unicodeFallbackLength;
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
  if (file.size > MAX_IMPORT_SIZE_MB * 1024 * 1024) {
    throw new Error(`Document is too large. Please choose a file under ${MAX_IMPORT_SIZE_MB}MB.`);
  }

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
  
  return {
    content: sanitizeDocumentHtml(content),
    fileName,
    format,
  };
}

export function getSupportedFormats(): string {
  return '.txt,.html,.htm,.rtf,.docx,.odt,.ott,.fodt';
}
