import { IMAGE_DATA_URL_PATTERN, isImageAlignment, normalizeImageWidthValue } from './media';
import { logError } from './logger';
import {
  MAX_GRAPHIC_JSON_LENGTH,
  appendGraphicFallback,
  parseSmartGraphicFromDom,
  parseSmartGraphicJson,
  serializeSmartGraphic,
} from './smartGraphic';

const BLOCKED_ELEMENTS = 'script, style, iframe, object, embed, link, meta, base';
const URI_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'formaction']);
const ALLOWED_ELEMENTS = new Set([
  'a',
  'blockquote',
  'b',
  'br',
  'code',
  'col',
  'colgroup',
  'div',
  'em',
  'i',
  'del',
  'strike',
  'h1',
  'h2',
  'h3',
  'hr',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);
const ALLOWED_ATTRIBUTES = new Set([
  'align',
  'alt',
  'class',
  'colspan',
  'colwidth',
  'contenteditable',
  'data-align',
  'data-background-color',
  'data-border',
  'data-borders',
  'data-lwrite-graphic',
  'data-width',
  'href',
  'rel',
  'rowspan',
  'src',
  'start',
  'style',
  'target',
  'title',
]);
const ALLOWED_CLASS_TOKENS = new Set([
  'block',
  'cursor-pointer',
  'h-auto',
  'hover:text-primary/80',
  'lwrite-graphic',
  'lwrite-graphic-title',
  'max-w-full',
  'mx-auto',
  'my-4',
  'rounded-lg',
  'text-primary',
  'underline',
]);
const ALLOWED_STYLE_PROPERTIES = new Set([
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  'max-width',
  'min-width',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'vertical-align',
  'width',
]);
const COLWIDTH_PATTERN = /^\d{1,4}(?:,\d{1,4}){0,32}$/;
const FORBIDDEN_STYLE_PATTERN =
  /expression\s*\(|url\s*\(|@import|-moz-binding|behavior\s*:|var\s*\(/i;
const CSS_SIZE_PATTERN = /^(?:0|[1-9]\d{0,2})(?:\.\d+)?(?:px|pt|em|rem|%)$/i;
const CSS_LENGTH_PATTERN = /^(?:0|[1-9]\d{0,4})(?:\.\d+)?(?:px|pt|em|rem|%)$/i;
const CSS_NUMBER_OR_SIZE_PATTERN = /^(?:normal|(?:0|[1-9]\d{0,2})(?:\.\d+)?(?:px|pt|em|rem|%)?)$/i;
const CSS_PERCENT_PATTERN = /^(?:0|[1-9]\d?|100)(?:\.\d+)?%$/;
const FONT_FAMILY_PATTERN = /^[a-z0-9\s"',._-]+$/i;

function removeControlAndWhitespace(value: string): string {
  // Match exactly the ASCII controls/whitespace excluded by URI checks.
  // Embedded images can contain megabytes of base64; avoid per-character arrays.
  // eslint-disable-next-line no-control-regex -- Intentionally strip URL-obfuscating controls.
  return value.replace(/[\u0000-\u0020\u007f]/g, '');
}

function isUnsafeUri(attributeName: string, value: string): boolean {
  const name = attributeName.toLowerCase();
  if (!URI_ATTRIBUTES.has(name)) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) return false;
  // Embedded images are valid only as image sources, never as executable links.
  if (/^data:/i.test(trimmed)) {
    return name !== 'src' || !IMAGE_DATA_URL_PATTERN.test(trimmed);
  }
  // Control characters can hide a scheme from this check and are never valid
  // in a link the editor can follow.
  // eslint-disable-next-line no-control-regex -- Intentionally reject URI-obfuscating controls.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return true;
  const normalized = removeControlAndWhitespace(trimmed).toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(normalized)?.[1];
  if (!scheme) return false;
  // The same protocols the link controls accept: web/mail links and relative
  // paths. Other schemes (tel, ftp, file, blob, …) have no target in the app.
  return name === 'href'
    ? !['http', 'https', 'mailto'].includes(scheme)
    : !['http', 'https'].includes(scheme);
}

function isSafeColorValue(value: string): boolean {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return true;
  if (/^[a-z]+$/i.test(trimmed)) return true;
  if (
    /^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /^hsla?\(\s*\d{1,3}(?:deg|rad|turn)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

function isSafeStyleDeclaration(property: string, value: string): boolean {
  if (!ALLOWED_STYLE_PROPERTIES.has(property) || FORBIDDEN_STYLE_PATTERN.test(value)) {
    return false;
  }

  switch (property) {
    case 'background-color':
    case 'color':
      return isSafeColorValue(value);
    case 'font-family':
      return value.length <= 120 && FONT_FAMILY_PATTERN.test(value);
    case 'font-size':
      return CSS_SIZE_PATTERN.test(value);
    case 'font-style':
      return /^(normal|italic|oblique)$/i.test(value);
    case 'font-weight':
      return /^(normal|bold|bolder|lighter|[1-9]00)$/i.test(value);
    case 'line-height':
      return CSS_NUMBER_OR_SIZE_PATTERN.test(value);
    case 'text-align':
      return /^(left|center|right|justify|start|end)$/i.test(value);
    case 'vertical-align':
      return /^(top|middle|bottom|baseline)$/i.test(value);
    case 'text-decoration':
    case 'text-decoration-line':
      return /^(none|underline|line-through|underline line-through|line-through underline)$/i.test(
        value,
      );
    case 'height':
      return /^auto$/i.test(value);
    case 'max-width':
    case 'min-width':
    case 'width':
      return (
        /^auto$/i.test(value) || CSS_PERCENT_PATTERN.test(value) || CSS_LENGTH_PATTERN.test(value)
      );
    default:
      return false;
  }
}

function sanitizeStyleAttribute(value: string): string | null {
  const declarations = value
    .split(';')
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator === -1) return null;

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const styleValue = declaration.slice(separator + 1).trim();
      if (!property || !styleValue || !isSafeStyleDeclaration(property, styleValue)) {
        return null;
      }

      return `${property}: ${styleValue}`;
    })
    .filter((declaration): declaration is string => declaration !== null);

  return declarations.length ? `${declarations.join('; ')};` : null;
}

function sanitizeClassAttribute(value: string): string | null {
  const classes = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => ALLOWED_CLASS_TOKENS.has(token));

  return classes.length ? classes.join(' ') : null;
}

function convertLegacySmartDiagrams(doc: Document): void {
  doc.body.querySelectorAll('[data-smart-diagram]').forEach((element) => {
    const title = (element.getAttribute('data-title') ?? '').replace(/\s+/g, ' ').trim();
    const items = (element.getAttribute('data-items') ?? '')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    const itemText = items.join(' -> ');
    const fallback = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    const text = title && itemText ? `${title}: ${itemText}` : title || itemText || fallback;
    const paragraph = doc.createElement('p');
    paragraph.textContent = text;
    element.replaceWith(paragraph);
  });
}

function convertSmartGraphics(doc: Document): void {
  doc.body.querySelectorAll('[data-lwrite-graphic]').forEach((element) => {
    element.querySelectorAll(BLOCKED_ELEMENTS).forEach((node) => node.remove());
    const parsed =
      parseSmartGraphicJson(element.getAttribute('data-lwrite-graphic')) ??
      parseSmartGraphicFromDom(element as HTMLElement);
    if (!parsed) {
      const fallback = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
      const paragraph = doc.createElement('p');
      paragraph.textContent = fallback;
      element.replaceWith(paragraph);
      return;
    }

    element.setAttribute('data-lwrite-graphic', serializeSmartGraphic(parsed));
    element.setAttribute('contenteditable', 'false');
    element.setAttribute('class', 'lwrite-graphic');
    appendGraphicFallback(doc, element, parsed);
  });
}

function sanitizeSpecialAttribute(attributeName: string, value: string): string | null {
  if (attributeName === 'contenteditable') {
    return value.toLowerCase() === 'false' ? 'false' : null;
  }
  if (attributeName === 'colwidth') {
    return COLWIDTH_PATTERN.test(value) ? value : null;
  }
  if (attributeName === 'data-background-color') {
    return isSafeColorValue(value) ? value : null;
  }
  // The editor turns these into inline layout. Only values it can render
  // safely may survive; anything else would become CSS after a reload.
  if (attributeName === 'data-align') {
    return isImageAlignment(value) ? value : null;
  }
  if (attributeName === 'data-width') {
    return normalizeImageWidthValue(value);
  }
  if (attributeName === 'data-border' || attributeName === 'data-borders') {
    return value === 'hidden' || value === 'visible' ? value : null;
  }
  if (attributeName === 'data-lwrite-graphic') {
    if (value.length > MAX_GRAPHIC_JSON_LENGTH) return null;
    const parsed = parseSmartGraphicJson(value);
    return parsed ? serializeSmartGraphic(parsed) : null;
  }
  return value;
}

export function sanitizeDocumentHtml(value: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');

    convertLegacySmartDiagrams(doc);
    convertSmartGraphics(doc);
    doc.body.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove());
    doc.body.querySelectorAll('*').forEach((element) => {
      if (!ALLOWED_ELEMENTS.has(element.tagName.toLowerCase())) {
        // Move children out one at a time: a huge imported wrapper can have
        // more children than the engine accepts as `replaceWith` arguments.
        const parent = element.parentNode;
        if (parent) {
          while (element.firstChild) parent.insertBefore(element.firstChild, element);
          parent.removeChild(element);
        }
        return;
      }

      Array.from(element.attributes).forEach((attribute) => {
        const attributeName = attribute.name.toLowerCase();

        if (
          attributeName.startsWith('on') ||
          attributeName === 'srcdoc' ||
          !ALLOWED_ATTRIBUTES.has(attributeName)
        ) {
          element.removeAttribute(attribute.name);
          return;
        }

        if (isUnsafeUri(attributeName, attribute.value)) {
          element.removeAttribute(attribute.name);
          return;
        }

        const specialValue = sanitizeSpecialAttribute(attributeName, attribute.value);
        if (
          attributeName === 'contenteditable' ||
          attributeName === 'colwidth' ||
          attributeName === 'data-align' ||
          attributeName === 'data-background-color' ||
          attributeName === 'data-border' ||
          attributeName === 'data-borders' ||
          attributeName === 'data-lwrite-graphic' ||
          attributeName === 'data-width'
        ) {
          if (specialValue) {
            element.setAttribute(attribute.name, specialValue);
          } else {
            element.removeAttribute(attribute.name);
          }
          return;
        }

        if (attributeName === 'style') {
          const safeStyle = sanitizeStyleAttribute(attribute.value);
          if (safeStyle) {
            element.setAttribute(attribute.name, safeStyle);
          } else {
            element.removeAttribute(attribute.name);
          }
        }

        if (attributeName === 'class') {
          const safeClass = sanitizeClassAttribute(attribute.value);
          if (safeClass) {
            element.setAttribute(attribute.name, safeClass);
          } else {
            element.removeAttribute(attribute.name);
          }
        }
      });

      if (element.tagName.toLowerCase() === 'a' && element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noreferrer noopener');
      }
    });

    return doc.body.innerHTML || '<p></p>';
  } catch (error) {
    logError('Failed to sanitize document HTML', error);
    return '<p></p>';
  }
}
