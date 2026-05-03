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
    .replace(/\s+/g, ' ')
    .trim();

  const fallback = cleaned || 'Untitled Document';
  return fallback.slice(0, 180);
}

export function buildExportFileName(value: string, extension: string): string {
  const base = sanitizeBaseFileName(value).replace(/\.[^/.]+$/, '');
  return `${base}.${extension}`;
}
