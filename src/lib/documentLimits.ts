import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';

/** Shared document/import boundary. Image limits live in media.ts. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function assertDocumentSize(value: string | Blob, limit = MAX_DOCUMENT_BYTES): void {
  const size = typeof value === 'string' ? new Blob([value]).size : value.size;
  if (size > limit) {
    throw new Error('Document is too large. Please choose a file under 20 MB.');
  }
}

/**
 * Sanitizes document HTML, then measures the markup that is actually stored.
 * Sanitation can grow it (tables gain `<tbody>`, style declarations gain
 * spacing), so checking only the raw input could persist an over-limit record
 * that the read path then refuses to open.
 */
export function sanitizeDocumentWithinLimit(html: string, limit = MAX_DOCUMENT_BYTES): string {
  const sanitized = sanitizeDocumentHtml(html);
  assertDocumentSize(sanitized, limit);
  return sanitized;
}
