import { useCallback } from 'react';
import { useLocale } from '@/hooks/useLocale';
import { formatShortcut } from '@/lib/shortcuts';

/** Formats `Mod+Shift+Z`-style shortcuts with the interface language's key names. */
export function useShortcutLabel(): (shortcut: string) => string {
  const { t } = useLocale();
  return useCallback(
    (shortcut: string) =>
      formatShortcut(shortcut, undefined, { Ctrl: t('keyCtrl'), Shift: t('keyShift'), Alt: t('keyAlt') }),
    [t],
  );
}
