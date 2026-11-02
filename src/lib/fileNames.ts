export function sanitizeBaseFileName(value: string): string {
  const trimmed = value.trim();
  const base = trimmed || 'Untitled Document';
  const normalized = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  const withoutControlChars = Array.from(normalized)
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('');

  const cleaned = withoutControlChars
    .replace(/[/?%*:|"<>]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/^\.+/g, '')
    .replace(/^-+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const fallback = cleaned || 'Untitled Document';
  // Truncate by code point so a limit never leaves a lone surrogate behind.
  const characters = Array.from(fallback);
  return characters.length > 180 ? characters.slice(0, 180).join('') : fallback;
}

export function buildExportFileName(value: string, extension: string): string {
  const base = sanitizeBaseFileName(value).replace(/\.[^/.]+$/, '');
  return `${base}.${extension}`;
}
