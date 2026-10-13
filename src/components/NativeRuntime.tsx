import { useEffect, type ReactNode } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { SystemBars, SystemBarsStyle, type PluginListenerHandle } from '@capacitor/core';
import { toast } from 'sonner';
import { isAndroid } from '@/lib/native/bridge';
import { dismissNativeOverlay, flushNativeSession, prepareNativeDeparture } from '@/lib/native/lifecycle';
import { logWarning } from '@/lib/logger';
import { readStoredLocale } from '@/lib/localePreference';
import { getBrowserLocale, t } from '@/lib/translations';

export function NativeRuntime({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isAndroid()) return;
    const listeners: PluginListenerHandle[] = [];
    let disposed = false;
    let backing = false;
    const retain = (listener: PluginListenerHandle) => {
      if (disposed) void listener.remove();
      else listeners.push(listener);
    };
    document.documentElement.dataset.platform = 'android';
    const styleBars = () => {
      void SystemBars.setStyle({ style: document.documentElement.classList.contains('dark') ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
        .catch((error: unknown) => logWarning('System bars unavailable', error));
    };
    styleBars();
    const observer = new MutationObserver(styleBars);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) void flushNativeSession();
    }).then(retain).catch((error: unknown) => logWarning('Native lifecycle listener unavailable', error));
    void CapacitorApp.addListener('backButton', () => {
      if (backing || dismissNativeOverlay()) return;
      if (window.location.pathname !== '/') {
        window.history.back();
        return;
      }
      backing = true;
      void prepareNativeDeparture().then(async (saved) => {
        if (saved) await CapacitorApp.minimizeApp();
        else toast.error(t(readStoredLocale() ?? getBrowserLocale(), 'saveFailed'));
      }).catch((error: unknown) => logWarning('Could not leave editor', error)).finally(() => { backing = false; });
    }).then(retain).catch((error: unknown) => logWarning('Native Back listener unavailable', error));
    return () => {
      disposed = true;
      observer.disconnect();
      for (const listener of listeners) void listener.remove();
      delete document.documentElement.dataset.platform;
    };
  }, []);
  return children;
}
