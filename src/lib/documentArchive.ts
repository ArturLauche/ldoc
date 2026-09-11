import type JSZip from 'jszip';
import { MAX_DOCUMENT_BYTES } from './documentLimits';
import { MAX_IMAGE_SIZE_MB } from './media';

// JSZip documents internalStream(), but 3.10's declarations omit it on entries.
type StreamingEntry = JSZip.JSZipObject & {
  internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
};

/**
 * Inflate sequentially into a shared budget before an XML parser or Mammoth
 * sees any entry. Count actual chunks, not attacker-controlled ZIP size fields.
 * Replace compressed entries with the verified bytes to avoid a second inflate.
 */
export async function openDocumentArchive(buffer: ArrayBuffer): Promise<JSZip> {
  const Zip = (await import('jszip')).default;
  const zip = await Zip.loadAsync(buffer);
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const limit = /^(?:word\/media|Pictures)\//i.test(entry.name)
      ? MAX_IMAGE_SIZE_MB * 1024 * 1024
      : MAX_DOCUMENT_BYTES;
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      let stopped = false;
      const stream = (entry as StreamingEntry).internalStream('uint8array');
      stream.on('data', (chunk) => {
        if (stopped) return;
        size += chunk.byteLength;
        expanded += chunk.byteLength;
        if (size > limit || expanded > MAX_DOCUMENT_BYTES) {
          stopped = true;
          stream.pause();
          reject(new Error('Expanded document or embedded image exceeds the size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => {
        if (stopped) return;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(bytes);
      });
      stream.resume();
    });
    zip.file(entry.name, bytes);
  }
  return zip;
}
