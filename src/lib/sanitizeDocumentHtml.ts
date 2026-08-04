import { logError } from './logger';

const BLOCKED_ELEMENTS = 'script, style, iframe, object, embed, link, meta, base';
const URI_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'formaction']);
const SAFE_DATA_URI_PATTERN = /^data:image\/(?:png|gif|jpeg|jpg|webp|svg\+xml);base64,/i;
const ALLOWED_ELEMENTS = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
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
  'contenteditable',
  'data-align',
  'data-item-count',
  'data-items',
  'data-smart-diagram',
  'data-step',
  'data-template',
  'data-title',
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
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'width',
]);
const FORBIDDEN_STYLE_PATTERN = /expression\s*\(|url\s*\(|@import|-moz-binding|behavior\s*:|var\s*\(/i;
const CSS_SIZE_PATTERN = /^(?:0|[1-9]\d{0,2})(?:\.\d+)?(?:px|pt|em|rem|%)$/i;
const CSS_NUMBER_OR_SIZE_PATTERN = /^(?:normal|(?:0|[1-9]\d{0,2})(?:\.\d+)?(?:px|pt|em|rem|%)?)$/i;
const CSS_PERCENT_PATTERN = /^(?:0|[1-9]\d?|100)(?:\.\d+)?%$/;
const FONT_FAMILY_PATTERN = /^[a-z0-9\s"',._-]+$/i;

function removeControlAndWhitespace(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x20 && code !== 0x7f;
    })
    .join('');
}

function isUnsafeUri(attributeName: string, value: string): boolean {
  if (!URI_ATTRIBUTES.has(attributeName.toLowerCase())) {
    return false;
  }

  const trimmed = value.trim();
  const normalized = removeControlAndWhitespace(trimmed).toLowerCase();

  if (!trimmed) return false;
  if (normalized.startsWith('javascript:')) return true;
  if (normalized.startsWith('vbscript:')) return true;
  if (normalized.startsWith('data:') && !SAFE_DATA_URI_PATTERN.test(trimmed)) return true;

  return false;
}

function isSafeColorValue(value: string): boolean {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return true;
  if (/^[a-z]+$/i.test(trimmed)) return true;
  if (/^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i.test(trimmed)) {
    return true;
  }
  if (/^hsla?\(\s*\d{1,3}(?:deg|rad|turn)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i.test(trimmed)) {
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
    case 'text-decoration':
    case 'text-decoration-line':
      return /^(none|underline|line-through|underline line-through|line-through underline)$/i.test(value);
    case 'height':
      return /^auto$/i.test(value);
    case 'max-width':
    case 'width':
      return /^auto$/i.test(value) || CSS_PERCENT_PATTERN.test(value);
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
    .filter((token) =>
      ALLOWED_CLASS_TOKENS.has(token) ||
      token === 'smart-diagram' ||
      token.startsWith('smart-diagram__') ||
      token.startsWith('smart-diagram--'),
    );

  return classes.length ? classes.join(' ') : null;
}

export function sanitizeDocumentHtml(value: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'text/html');

    doc.body.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove());
    doc.body.querySelectorAll('*').forEach((element) => {
      if (!ALLOWED_ELEMENTS.has(element.tagName.toLowerCase())) {
        element.replaceWith(...Array.from(element.childNodes));
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

        if (attributeName === 'contenteditable' && attribute.value.toLowerCase() !== 'false') {
          element.removeAttribute(attribute.name);
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
