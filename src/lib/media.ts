const IMAGE_ALIGNMENT_OPTIONS = ['left', 'center', 'right'] as const;
const IMAGE_WIDTH_OPTIONS = ['25', '50', '75', '100'] as const;

export const DEFAULT_IMAGE_ALIGNMENT = 'center';
export const DEFAULT_IMAGE_WIDTH = '100';
export const MAX_IMAGE_SIZE_MB = 10;

export type ImageAlignment = (typeof IMAGE_ALIGNMENT_OPTIONS)[number];
export type ImageWidth = (typeof IMAGE_WIDTH_OPTIONS)[number];

export type ImageFileError = 'not-image' | 'too-large';
export type ImageUrlError = 'empty' | 'invalid-protocol' | 'invalid-url' | 'too-large';

// Keep uploads, pasted data URLs, and persisted image sources consistent.
export const IMAGE_MIME_PATTERN =
  /^image\/(?:png|gif|jpeg|jpg|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i;
export const IMAGE_DATA_URL_PATTERN =
  /^data:(image\/(?:png|gif|jpeg|jpg|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon));base64,([a-z0-9+/\s]*={0,2})$/i;

export const normalizeImageAlignment = (value?: string | null): ImageAlignment => {
  if (value && IMAGE_ALIGNMENT_OPTIONS.includes(value as ImageAlignment)) {
    return value as ImageAlignment;
  }
  return DEFAULT_IMAGE_ALIGNMENT;
};

export const normalizeImageWidth = (value?: string | null): ImageWidth => {
  if (value && IMAGE_WIDTH_OPTIONS.includes(value as ImageWidth)) {
    return value as ImageWidth;
  }
  return DEFAULT_IMAGE_WIDTH;
};

export const sanitizeAltText = (value?: string | null): string => value?.trim() ?? '';

export const validateImageFile = (
  file: File,
): { ok: true } | { ok: false; code: ImageFileError } => {
  if (!IMAGE_MIME_PATTERN.test(file.type)) {
    return { ok: false, code: 'not-image' };
  }

  const maxSizeBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { ok: false, code: 'too-large' };
  }

  return { ok: true };
};

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('Unexpected file reader result.'));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read file.'));
    };

    reader.onabort = () => {
      reject(new Error('File reading was aborted.'));
    };

    reader.readAsDataURL(file);
  });

export const normalizeImageUrl = (
  value: string,
): { ok: true; url: string } | { ok: false; code: ImageUrlError } => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, code: 'empty' };
  }

  if (/^data:/i.test(trimmed)) {
    const match = IMAGE_DATA_URL_PATTERN.exec(trimmed);
    if (!match) return { ok: false, code: 'invalid-url' };
    const encoded = match[2].replace(/\s+/g, '');
    const size =
      (encoded.length * 3) / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
    if (size > MAX_IMAGE_SIZE_MB * 1024 * 1024) return { ok: false, code: 'too-large' };
    try {
      atob(encoded);
    } catch {
      return { ok: false, code: 'invalid-url' };
    }
    return { ok: true, url: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return { ok: false, code: 'invalid-url' };
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, code: 'invalid-protocol' };
    }

    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, code: 'invalid-url' };
  }
};
