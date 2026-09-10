/** Shared document/import boundary. Image limits live in media.ts. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export function assertDocumentSize(value: string | Blob): void {
  const size = typeof value === 'string' ? new Blob([value]).size : value.size;
  if (size > MAX_DOCUMENT_BYTES) {
    throw new Error('Document is too large. Please choose a file under 20 MB.');
  }
}
