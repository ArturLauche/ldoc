import { isAndroid } from '@/lib/native/bridge';
import { deliverNativeBlob } from '@/lib/native/files';

const REVOKE_DELAY_MS = 60_000;

export async function downloadBlob(blob: Blob, filename: string): Promise<boolean> {
  if (isAndroid()) return deliverNativeBlob(blob, filename, 'save');
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return false;
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
  return true;
}

function scheduleRevoke(url: string): void {
  const revoke = () => URL.revokeObjectURL(url);
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
    window.setTimeout(revoke, REVOKE_DELAY_MS);
    return;
  }
  setTimeout(revoke, REVOKE_DELAY_MS);
}
