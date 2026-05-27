const REVOKE_DELAY_MS = 60_000;

export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  scheduleRevoke(url);
}

function scheduleRevoke(url: string): void {
  const revoke = () => URL.revokeObjectURL(url);
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(revoke, REVOKE_DELAY_MS);
    return;
  }
  setTimeout(revoke, REVOKE_DELAY_MS);
}
