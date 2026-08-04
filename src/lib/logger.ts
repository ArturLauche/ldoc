/**
 * Centralized logging helpers.
 *
 * Raw error objects (stack traces, internal file paths, user-controlled
 * strings) are only surfaced during development. Production builds log a
 * short, generic message so the browser console never leaks internals.
 */
const isDevelopment = Boolean(import.meta.env?.DEV);

export function logError(message: string, error?: unknown): void {
  if (isDevelopment && error !== undefined) {
    console.error(message, error);
    return;
  }
  console.error(message);
}

export function logWarning(message: string, detail?: unknown): void {
  if (isDevelopment && detail !== undefined) {
    console.warn(message, detail);
    return;
  }
  console.warn(message);
}
