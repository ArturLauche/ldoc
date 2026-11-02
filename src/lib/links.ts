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
    // Only a real scheme (or a host with a port, which also contains a colon)
    // may skip the `https://` prefix. Treating any `word:` as a scheme made
    // `example.com:8080` look like an unknown protocol.
    const hasScheme = /^(?:https?|mailto):/i.test(trimmed) || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
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
