import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { isAndroid, NativeFiles, type NativeFile } from '@/lib/native/bridge';
import { readNativeFile } from '@/lib/native/files';
import { useLocale } from '@/hooks/useLocale';
import { logWarning } from '@/lib/logger';

/** Consume staged content URIs only after the editor has loaded its saved draft. */
export function useIncomingAndroidFiles(ready: boolean, onFile: (file: File) => Promise<void>): void {
  const { t } = useLocale();
  const draining = useRef(false);
  useEffect(() => {
    if (!ready || !isAndroid()) return;
    let cancelled = false;
    const drain = async () => {
      if (draining.current || cancelled) return;
      draining.current = true;
      try {
        const pending = await NativeFiles.pendingFiles();
        if (pending.error) toast.error(t('importFailed'));
        for (const file of pending.files) {
          if (cancelled) break;
          try {
            await onFile(await readNativeFile(file));
          } catch (error) {
            logWarning('Incoming document could not be opened', error);
            toast.error(t('importFailed'));
          } finally {
            await release(file);
          }
        }
      } catch (error) {
        logWarning('Incoming file queue unavailable', error);
        toast.error(t('importFailed'));
      } finally {
        draining.current = false;
      }
    };
    const listener = NativeFiles.addListener('incomingFiles', () => { void drain(); });
    void listener.then(() => drain());
    return () => {
      cancelled = true;
      void listener.then((handle) => handle.remove());
    };
  }, [onFile, ready, t]);
}

const release = (file: NativeFile) => NativeFiles.releaseFile({ id: file.id });
