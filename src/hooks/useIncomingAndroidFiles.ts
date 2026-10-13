import { useEffect, useEffectEvent, useRef } from 'react';
import { toast } from 'sonner';
import { isAndroid, NativeFiles, type NativeFile } from '@/lib/native/bridge';
import { readNativeFile } from '@/lib/native/files';
import { useLocale } from '@/hooks/useLocale';
import { logWarning } from '@/lib/logger';

/** Consume staged content URIs only after the editor has loaded its saved draft. */
export function useIncomingAndroidFiles(ready: boolean, onFile: (file: File) => Promise<void>): void {
  const { t } = useLocale();
  const draining = useRef(false);
  const again = useRef(false);
  const unmounted = useRef(false);
  const onIncomingFile = useEffectEvent(onFile);
  const drain = useEffectEvent(async () => {
    if (!ready || unmounted.current) return;
    if (draining.current) { again.current = true; return; }
    draining.current = true;
    try {
      do {
        again.current = false;
        const pending = await NativeFiles.pendingFiles();
        if (pending.error) toast.error(t('importFailed'));
        for (const file of pending.files) {
          if (unmounted.current) break;
          let consumed = false;
          try {
            const content = await readNativeFile(file);
            if (unmounted.current) break;
            consumed = true;
            await onIncomingFile(content);
          } catch (error) {
            consumed = true;
            logWarning('Incoming document could not be opened', error);
            toast.error(t('importFailed'));
          } finally {
            if (consumed) await release(file);
          }
        }
      } while (again.current && !unmounted.current);
    } catch (error) {
      logWarning('Incoming file queue unavailable', error);
      toast.error(t('importFailed'));
    } finally {
      draining.current = false;
    }
  });
  useEffect(() => {
    if (!isAndroid()) return;
    unmounted.current = false;
    const listener = NativeFiles.addListener('incomingFiles', () => { void drain(); }).catch((error: unknown) => {
      logWarning('Incoming file listener unavailable', error);
      return null;
    });
    void listener.then(() => drain());
    return () => {
      unmounted.current = true;
      void listener.then((handle) => handle?.remove());
    };
  }, []);
  useEffect(() => { if (ready && isAndroid()) void drain(); }, [ready]);
}

const release = (file: NativeFile) => NativeFiles.releaseFile({ id: file.id });
