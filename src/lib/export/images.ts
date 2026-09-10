import type { ExportDocumentModel, ExportImageBlock, PreparedExportImage } from './types';
import { walkBlocks } from './shared';
import type { WarningCollector } from './warnings';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const IMAGE_TIMEOUT_MS = 15_000;

type ParsedImageSource = {
  bytes: Uint8Array;
  mimeType: string;
  detail: string;
};

export async function prepareExportImages(
  documentModel: ExportDocumentModel,
  warnings: WarningCollector,
): Promise<ExportDocumentModel> {
  const images: ExportImageBlock[] = [];
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'image') images.push(block);
  });

  // Cache only for this export: repeated logos share one download and decode,
  // while a later export still sees changes to remote images.
  const preparedBySource = new Map<string, PreparedExportImage | undefined>();
  for (const image of images) {
    if (image.src && preparedBySource.has(image.src)) {
      image.prepared = preparedBySource.get(image.src);
      continue;
    }
    image.prepared = await prepareImage(image, warnings);
    if (image.src) preparedBySource.set(image.src, image.prepared);
  }

  return documentModel;
}

async function prepareImage(
  image: ExportImageBlock,
  warnings: WarningCollector,
): Promise<PreparedExportImage | undefined> {
  if (!image.src) {
    warnings.add('image-decode-failed', image.alt);
    return undefined;
  }

  const parsed = image.src.startsWith('data:')
    ? parseDataImage(image.src, warnings)
    : await fetchRemoteImage(image.src, warnings);
  if (!parsed) return undefined;

  if (parsed.bytes.byteLength > MAX_IMAGE_BYTES) {
    warnings.add('image-too-large', parsed.detail);
    return undefined;
  }

  const prepared = await normalizePreparedImage(parsed, warnings);
  if (!prepared) return undefined;
  if (
    prepared.bytes.byteLength > MAX_IMAGE_BYTES ||
    prepared.width * prepared.height > MAX_IMAGE_PIXELS
  ) {
    warnings.add('image-too-large', parsed.detail);
    return undefined;
  }
  return prepared;
}

function parseDataImage(src: string, warnings: WarningCollector): ParsedImageSource | undefined {
  const match = src.match(/^data:([^;,]+);base64,(.*)$/is);
  if (!match) {
    warnings.add('image-decode-failed', 'data-url');
    return undefined;
  }

  const mimeType = normalizeMimeType(match[1]);
  const encoded = match[2].replace(/\s+/g, '');
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    warnings.add('image-too-large', mimeType);
    return undefined;
  }
  try {
    const bytes = base64ToBytes(encoded);
    return { bytes, mimeType, detail: mimeType };
  } catch {
    warnings.add('image-decode-failed', mimeType);
    return undefined;
  }
}

async function fetchRemoteImage(
  src: string,
  warnings: WarningCollector,
): Promise<ParsedImageSource | undefined> {
  if (typeof fetch !== 'function') {
    warnings.add('image-fetch-failed', src);
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(src, { mode: 'cors', signal: controller.signal });
    if (!response.ok) {
      warnings.add('image-fetch-failed', src);
      return undefined;
    }
    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      controller.abort();
      warnings.add('image-too-large', src);
      return undefined;
    }
    const bytes = await readBoundedImage(response, controller);
    if (!bytes) {
      warnings.add('image-too-large', src);
      return undefined;
    }
    const contentType = normalizeMimeType(
      response.headers.get('content-type') ?? inferMimeTypeFromPath(src),
    );
    return { bytes, mimeType: contentType, detail: src };
  } catch (error) {
    warnings.add(error instanceof TypeError ? 'image-remote-cors' : 'image-fetch-failed', src);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedImage(
  response: Response,
  controller: AbortController,
): Promise<Uint8Array | undefined> {
  // Streaming bounds memory even when a server omits or lies about Content-Length.
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= MAX_IMAGE_BYTES ? bytes : undefined;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        controller.abort();
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function normalizePreparedImage(
  parsed: ParsedImageSource,
  warnings: WarningCollector,
): Promise<PreparedExportImage | undefined> {
  const mimeType = normalizeMimeType(parsed.mimeType);
  if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    const dimensions = readImageDimensions(parsed.bytes, mimeType);
    if (!dimensions || !dimensions.width || !dimensions.height) {
      warnings.add('image-decode-failed', parsed.detail);
      return undefined;
    }
    return {
      bytes: parsed.bytes,
      mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
      extension: mimeType === 'image/png' ? 'png' : 'jpg',
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  // Decode the bytes already fetched; loading the remote URL again can fail
  // independently, wastes bandwidth, and bypasses the download size check.
  const rasterized = await rasterizeImage(parsed);
  if (rasterized) {
    warnings.add(
      mimeType === 'image/svg+xml' ? 'image-svg-rasterized' : 'image-format-unsupported',
      parsed.detail,
    );
    return rasterized;
  }

  warnings.add(
    mimeType === 'image/svg+xml' ? 'image-svg-placeholder' : 'image-format-unsupported',
    parsed.detail,
  );
  return undefined;
}

function normalizeMimeType(value: string): string {
  return value.split(';')[0].trim().toLowerCase();
}

function inferMimeTypeFromPath(path: string): string {
  const clean = path.split('?')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readImageDimensions(
  bytes: Uint8Array,
  mimeType: string,
): { width: number; height: number } | null {
  if (mimeType === 'image/png') return readPngDimensions(bytes);
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return readJpegDimensions(bytes);
  return null;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20),
  };
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc3 && offset + 8 < bytes.length) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function rasterizeImage(parsed: ParsedImageSource): Promise<PreparedExportImage | undefined> {
  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const source = URL.createObjectURL(
      new Blob([Uint8Array.from(parsed.bytes)], { type: parsed.mimeType }),
    );
    const image = new Image();
    const finish = (result?: PreparedExportImage) => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(source);
      resolve(result);
    };
    const timeout = setTimeout(() => finish(), IMAGE_TIMEOUT_MS);
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
          finish();
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish();
          return;
        }
        ctx.drawImage(image, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob || blob.size > MAX_IMAGE_BYTES) {
            finish();
            return;
          }
          void blob.arrayBuffer().then(
            (buffer) =>
              finish({
                bytes: new Uint8Array(buffer),
                mimeType: 'image/png',
                extension: 'png',
                width,
                height,
              }),
            () => finish(),
          );
        }, 'image/png');
      } catch {
        finish();
      }
    };
    image.onerror = () => finish();
    image.src = source;
  });
}
