import mammoth from 'mammoth';

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToParagraphHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const normalized = lines.length ? lines : [''];
  return normalized.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}

function sanitizeImportedHtml(value: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');

    doc.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.toLowerCase().startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body.innerHTML || '<p></p>';
  } catch (error) {
    console.error('Failed to sanitize imported HTML:', error);
    return value;
  }
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

// Import ODT (OpenDocument Text) - basic support
async function importOdt(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const blob = new Blob([arrayBuffer]);
    const zip = await import('jszip').then(m => m.default || m);
    const zipFile = await zip.loadAsync(blob);
    
    const contentXml = await zipFile.file('content.xml')?.async('string');
    if (!contentXml) {
      throw new Error('Invalid ODT file');
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(contentXml, 'text/xml');
    
    let html = '';
    const textElements = doc.getElementsByTagName('text:p');
    
    for (let i = 0; i < textElements.length; i++) {
      const element = textElements[i];
      const styleName = element.getAttribute('text:style-name') || '';
      
      let tag = 'p';
      if (styleName.includes('Heading_20_1')) tag = 'h1';
      else if (styleName.includes('Heading_20_2')) tag = 'h2';
      else if (styleName.includes('Heading_20_3')) tag = 'h3';
      
      html += `<${tag}>${processOdtNode(element)}</${tag}>`;
    }
    
    return html || '<p></p>';
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
    const textElements = doc.getElementsByTagName('text:p');
    let html = '';

    for (let i = 0; i < textElements.length; i++) {
      const element = textElements[i];
      html += `<p>${processOdtNode(element)}</p>`;
    }

    return html || '<p></p>';
  } catch (error) {
    console.error('FODT import error:', error);
    const text = await file.text();
    return textToParagraphHtml(text);
  }
}

function processOdtNode(node: Element): string {
  let result = '';
  
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tagName = el.tagName.toLowerCase();
      
      if (tagName === 'text:span') {
        const styleName = el.getAttribute('text:style-name') || '';
        let prefix = '';
        let suffix = '';
        
        if (styleName.includes('Bold')) {
          prefix = '<strong>';
          suffix = '</strong>';
        }
        if (styleName.includes('Italic')) {
          prefix = '<em>' + prefix;
          suffix = suffix + '</em>';
        }
        
        result += prefix + processOdtNode(el) + suffix;
      } else if (tagName === 'text:a') {
        const href = el.getAttribute('xlink:href') || '#';
        result += `<a href="${href}">${processOdtNode(el)}</a>`;
      } else {
        result += processOdtNode(el);
      }
    }
  }
  
  return result;
}

// Simple RTF to HTML converter
function importRtf(text: string): string {
  const content = text
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\*?\\[^{}]+\}|[{}]|\\[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .trim();
  
  return textToParagraphHtml(content);
}

// Main import function
export async function importDocument(file: File): Promise<ImportResult> {
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
      return sanitizeImportedHtml(await file.text());
    case 'rtf':
      return importRtf(await file.text());
    case 'txt':
    default:
      return textToParagraphHtml(await file.text());
    }
  })();
  
  return {
    content,
    fileName,
    format,
  };
}

export function getSupportedFormats(): string {
  return '.txt,.html,.htm,.rtf,.docx,.odt,.ott,.fodt';
}
