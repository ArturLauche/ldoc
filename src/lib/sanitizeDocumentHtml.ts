const BLOCKED_ELEMENTS = 'script, style, iframe, object, embed, link, meta, base';
const URI_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'formaction']);
const SAFE_DATA_URI_PATTERN = /^data:image\/(?:png|gif|jpeg|jpg|webp|svg\+xml);base64,/i;

function isUnsafeUri(attributeName: string, value: string): boolean {
  if (!URI_ATTRIBUTES.has(attributeName.toLowerCase())) {
    return false;
  }

  const trimmed = value.trim();
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();

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

    doc.querySelectorAll(BLOCKED_ELEMENTS).forEach((element) => element.remove());
    doc.querySelectorAll('*').forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        const attributeName = attribute.name.toLowerCase();

        if (attributeName.startsWith('on') || attributeName === 'srcdoc') {
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
    });

    return doc.body.innerHTML || '<p></p>';
  } catch (error) {
    console.error('Failed to sanitize document HTML:', error);
    return '<p></p>';
  }
}
