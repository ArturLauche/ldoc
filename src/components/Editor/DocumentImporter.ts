import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export type SupportedFormat = 'txt' | 'html' | 'htm' | 'rtf' | 'docx' | 'odt' | 'pdf';

export interface ImportResult {
  content: string;
  fileName: string;
  format: SupportedFormat;
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
  // ODT files are ZIP files containing content.xml
  // For a basic implementation, we'll extract text content
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    // Use JSZip-like approach with native browser APIs
    const blob = new Blob([arrayBuffer]);
    const zip = await import('jszip').then(m => m.default || m);
    const zipFile = await zip.loadAsync(blob);
    
    const contentXml = await zipFile.file('content.xml')?.async('string');
    if (!contentXml) {
      throw new Error('Invalid ODT file');
    }
    
    // Parse the XML and extract text content
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
    // Fallback: read as text
    const text = await file.text();
    return `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
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

// Import PDF using pdf.js
async function importPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let html = '';
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    let pageText = '';
    let lastY: number | null = null;
    
    for (const item of textContent.items) {
      if ('str' in item) {
        const textItem = item as { str: string; transform: number[] };
        const currentY = textItem.transform[5];
        
        if (lastY !== null && Math.abs(currentY - lastY) > 10) {
          pageText += '</p><p>';
        } else if (lastY !== null && pageText.length > 0) {
          pageText += ' ';
        }
        
        pageText += textItem.str;
        lastY = currentY;
      }
    }
    
    if (pageText) {
      html += `<p>${pageText}</p>`;
    }
    
    if (pageNum < pdf.numPages) {
      html += '<hr/>';
    }
  }
  
  return html || '<p></p>';
}

// Simple RTF to HTML converter
function importRtf(text: string): string {
  let content = text
    .replace(/\\par[d]?/g, '\n')
    .replace(/\{\*?\\[^{}]+\}|[{}]|\\[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, '')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .trim();
  
  return `<p>${content.split('\n').filter(p => p.trim()).join('</p><p>')}</p>`;
}

// Main import function
export async function importDocument(file: File): Promise<ImportResult> {
  const fileName = file.name.replace(/\.[^/.]+$/, '');
  const extension = file.name.split('.').pop()?.toLowerCase() as SupportedFormat;
  
  let content: string;
  
  switch (extension) {
    case 'docx':
      content = await importDocx(file);
      break;
    case 'odt':
      content = await importOdt(file);
      break;
    case 'pdf':
      content = await importPdf(file);
      break;
    case 'html':
    case 'htm':
      content = await file.text();
      break;
    case 'rtf':
      content = importRtf(await file.text());
      break;
    case 'txt':
    default:
      const text = await file.text();
      content = `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
      break;
  }
  
  return {
    content,
    fileName,
    format: extension,
  };
}

export function getSupportedFormats(): string {
  return '.txt,.html,.htm,.rtf,.docx,.odt,.pdf';
}
