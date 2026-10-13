import { useCallback, useEffect, useState } from 'react';
import { isAndroid, NativeUpdater, type AndroidUpdateState } from '@/lib/native/bridge';
import { validateUpdateState } from '@/lib/native/updates';
import { logWarning } from '@/lib/logger';

export function useAndroidUpdater() {
  const [state, setState] = useState<AndroidUpdateState | null>(null);
  const [bridgeError, setBridgeError] = useState(false);
  const check = useCallback(async (manual = true) => {
    try {
      const next = await NativeUpdater.check({ manual });
      if (!validateUpdateState(next)) throw new Error('Invalid update status.');
      setState(next);
      setBridgeError(false);
    } catch (error) {
      logWarning('Android updater unavailable', error);
      setBridgeError(true);
    }
  }, []);
  useEffect(() => {
    if (!isAndroid()) return;
    let cancelled = false;
    const accept = (next: unknown) => { if (!cancelled && validateUpdateState(next)) setState(next); };
    const subscription = NativeUpdater.addListener('stateChanged', accept).catch((error: unknown) => {
      logWarning('Android update listener unavailable', error);
      if (!cancelled) setBridgeError(true);
      return null;
    });
    void NativeUpdater.getState().then(accept).then(() => { if (!cancelled) return check(false); })
      .catch(() => { if (!cancelled) setBridgeError(true); });
    const resume = () => { if (document.visibilityState !== 'hidden') void check(false); };
    // Native code enforces a six-hour check interval, persisted backoff and one transfer.
    const interval = window.setInterval(resume, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      void subscription.then((handle) => handle?.remove());
    };
  }, [check]);
  return { state, check, bridgeError };
}
