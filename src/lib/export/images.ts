import type { ExportDocumentModel, ExportImageBlock, PreparedExportImage } from './types';
import { walkBlocks } from './shared';
import type { WarningCollector } from './warnings';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;

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

  for (const image of images) {
    image.prepared = await prepareImage(image, warnings);
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

  const prepared = await normalizePreparedImage(parsed, image.src, warnings);
  if (!prepared) return undefined;
  if (prepared.width * prepared.height > MAX_IMAGE_PIXELS) {
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
  try {
    const bytes = base64ToBytes(match[2]);
    return { bytes, mimeType, detail: mimeType };
  } catch {
    warnings.add('image-decode-failed', mimeType);
    return undefined;
  }
}

async function fetchRemoteImage(src: string, warnings: WarningCollector): Promise<ParsedImageSource | undefined> {
  if (typeof fetch !== 'function') {
    warnings.add('image-fetch-failed', src);
    return undefined;
  }

  try {
    const response = await fetch(src, { mode: 'cors' });
    if (!response.ok) {
      warnings.add('image-fetch-failed', src);
      return undefined;
    }
    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      warnings.add('image-too-large', src);
      return undefined;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = normalizeMimeType(response.headers.get('content-type') ?? inferMimeTypeFromPath(src));
    return { bytes, mimeType: contentType, detail: src };
  } catch (error) {
    warnings.add(error instanceof TypeError ? 'image-remote-cors' : 'image-fetch-failed', src);
    return undefined;
  }
}

async function normalizePreparedImage(
  parsed: ParsedImageSource,
  src: string,
  warnings: WarningCollector,
): Promise<PreparedExportImage | undefined> {
  const mimeType = normalizeMimeType(parsed.mimeType);
  if (mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    const dimensions = readImageDimensions(parsed.bytes, mimeType);
    if (!dimensions) {
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

  const rasterized = await rasterizeImage(src);
  if (rasterized) {
    warnings.add(mimeType === 'image/svg+xml' ? 'image-svg-rasterized' : 'image-format-unsupported', parsed.detail);
    return rasterized;
  }

  warnings.add(mimeType === 'image/svg+xml' ? 'image-svg-placeholder' : 'image-format-unsupported', parsed.detail);
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

function readImageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
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

function rasterizeImage(src: string): Promise<PreparedExportImage | undefined> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height || width * height > MAX_IMAGE_PIXELS) {
        resolve(undefined);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(undefined);
        return;
      }
      ctx.drawImage(image, 0, 0);
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            resolve(undefined);
            return;
          }
          const bytes = new Uint8Array(await blob.arrayBuffer());
          resolve({
            bytes,
            mimeType: 'image/png',
            extension: 'png',
            width,
            height,
          });
        },
        'image/png',
        0.92,
      );
    };
    image.onerror = () => resolve(undefined);
    image.src = src;
  });
}
