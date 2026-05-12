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
  'style',
  'target',
  'title',
]);

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

function sanitizeStyleAttribute(value: string): string | null {
  if (/expression\s*\(|url\s*\(/i.test(value)) {
    return null;
  }

  return value;
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
      });

      if (element.tagName.toLowerCase() === 'a' && element.getAttribute('target') === '_blank') {
        element.setAttribute('rel', 'noreferrer noopener');
      }
    });

    return doc.body.innerHTML || '<p></p>';
  } catch (error) {
    console.error('Failed to sanitize document HTML:', error);
    return '<p></p>';
  }
}
