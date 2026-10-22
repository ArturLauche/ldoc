/** Link input normalization shared by editor controls and HTML ingress. */
export function normalizeLinkUrl(value: string): string | null {
  const trimmed = value.trim();
  if (
    !trimmed ||
    Array.from(trimmed).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  if (/^(?:#|\/(?![\\/])|\.\.?\/)/.test(trimmed)) return trimmed;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return null;
    if (url.protocol !== 'mailto:' && (!url.hostname || url.username || url.password)) return null;
    // A phrase pasted instead of an address ("not a link") is not a host; some
    // engines percent-encode the spaces instead of rejecting it.
    if (url.protocol !== 'mailto:' && /[\s%]/.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
