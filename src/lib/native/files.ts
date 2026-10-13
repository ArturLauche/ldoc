import { MAX_DOCUMENT_BYTES } from '@/lib/documentLimits';
import { MAX_IMAGE_SIZE_MB } from '@/lib/media';
import { isAndroid, NativeFiles, type NativeFile } from './bridge';

const CHUNK_BYTES = 192 * 1024;
const MAX_IMAGE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

/** Keep bridge messages bounded even for large documents and image-heavy exports. */
export async function readNativeFile(file: NativeFile, maxBytes = MAX_DOCUMENT_BYTES): Promise<File> {
  if (!/^[a-f0-9-]{36}$/.test(file.id) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > maxBytes) {
    throw new Error('Invalid or oversized native file.');
  }
  const parts: ArrayBuffer[] = [];
  let offset = 0;
  while (offset < file.size) {
    const { data } = await NativeFiles.readChunk({ id: file.id, offset });
    const raw = atob(data);
    if (raw.length === 0 || raw.length > CHUNK_BYTES || offset + raw.length > file.size) {
      throw new Error('Incomplete native file.');
    }
    const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
    parts.push(bytes.buffer);
    offset += bytes.length;
  }
  return new File(parts, file.name, { type: file.mimeType });
}

export function pickFiles(options: {
  accept: string;
  kind: 'document' | 'library' | 'mixed' | 'image';
  multiple?: boolean;
}): Promise<File[]> {
  if (isAndroid()) return pickNativeFiles(options);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    input.multiple = options.multiple ?? false;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

async function pickNativeFiles(options: { kind: 'document' | 'library' | 'mixed' | 'image'; multiple?: boolean }): Promise<File[]> {
  const { files } = await NativeFiles.pickFiles({ kind: options.kind, multiple: options.multiple ?? false });
  try {
    const result: File[] = [];
    for (const file of files) result.push(await readNativeFile(file, options.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES));
    return result;
  } finally {
    await Promise.all(files.map((file) => NativeFiles.releaseFile({ id: file.id })));
  }
}

export async function deliverNativeBlob(blob: Blob, name: string, action: 'save' | 'share' | 'print'): Promise<boolean> {
  const { id } = await NativeFiles.beginExport({ name, mimeType: blob.type.split(';')[0] || 'application/octet-stream', size: blob.size });
  let handedOff = false;
  try {
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
      // Avoid spreading a large typed array into a function's argument stack.
      const text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
      await NativeFiles.writeChunk({ id, offset, data: btoa(text) });
    }
    const { completed } = await NativeFiles.finishExport({ id, action });
    handedOff = completed && action !== 'save';
    return completed;
  } finally {
    // Shared/printed files stay available to the recipient; native expiry cleans them.
    if (!handedOff) await NativeFiles.releaseFile({ id });
  }
}
