const IMAGE_ALIGNMENT_OPTIONS = ['left', 'center', 'right'] as const;
const IMAGE_WIDTH_OPTIONS = ['25', '50', '75', '100'] as const;

export const DEFAULT_IMAGE_ALIGNMENT = 'center';
export const DEFAULT_IMAGE_WIDTH = '100';
const MAX_IMAGE_SIZE_MB = 10;

export type ImageAlignment = (typeof IMAGE_ALIGNMENT_OPTIONS)[number];
export type ImageWidth = (typeof IMAGE_WIDTH_OPTIONS)[number];

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

export const sanitizeAltText = (value?: string | null): string =>
  value?.trim() ?? '';

export const validateImageFile = (file: File): { ok: true } | { ok: false; message: string } => {
  if (!file.type.startsWith('image/')) {
    return { ok: false, message: 'Please select an image file' };
  }

  const maxSizeBytes = MAX_IMAGE_SIZE_MB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      ok: false,
      message: `Image is too large. Please choose a file under ${MAX_IMAGE_SIZE_MB}MB`,
    };
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
  value: string
): { ok: true; url: string } | { ok: false; message: string } => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: 'Please enter an image URL' };
  }

  if (trimmed.startsWith('data:image/')) {
    return { ok: true, url: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { ok: false, message: 'Please enter a valid HTTP or HTTPS URL' };
    }

    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, message: 'Please enter a valid URL' };
  }
};

const encodeSvgToBase64 = (svg: string): string => {
  if (typeof TextEncoder === 'undefined') {
    return btoa(unescape(encodeURIComponent(svg)));
  }

  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const createSvgDataUrl = (svg: string): string | null => {
  try {
    const base64 = encodeSvgToBase64(svg);
    return `data:image/svg+xml;base64,${base64}`;
  } catch (error) {
    console.error('Failed to encode SVG:', error);
    return null;
  }
};
