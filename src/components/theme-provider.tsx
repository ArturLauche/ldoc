import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type ThemeContextValue } from '@/hooks/useTheme';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  DARK_SCHEME_QUERY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  subscribeThemePreference,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme';

/** Light, dark or system theme, persisted through `src/lib/storage.ts` and synced across tabs. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readThemePreference);
  const systemDark = useMediaQuery(DARK_SCHEME_QUERY);
  const resolvedTheme = resolveTheme(theme, systemDark);

  useLayoutEffect(() => applyTheme(resolvedTheme), [resolvedTheme]);
  useEffect(() => subscribeThemePreference(setThemeState), []);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    writeThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
