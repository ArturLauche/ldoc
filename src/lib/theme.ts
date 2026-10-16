import { readStorageItem, subscribeStorageItem, writeStorageItem } from './storage';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * The key and values earlier versions stored through next-themes, so saved
 * preferences carry over. `index.html` reads the same key before first paint.
 */
export const THEME_STORAGE_KEY = 'theme';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Browser chrome matches the app bar (the `--card` token of each theme). */
export const THEME_CHROME_COLORS: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#1d212b',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemePreference(): ThemePreference {
  const stored = readStorageItem(THEME_STORAGE_KEY);
  return stored.ok && isThemePreference(stored.value) ? stored.value : 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  // Losing the preference never affects documents; a failed write is ignored.
  writeStorageItem(THEME_STORAGE_KEY, preference);
}

export function subscribeThemePreference(onChange: (preference: ThemePreference) => void) {
  return subscribeStorageItem(THEME_STORAGE_KEY, (value) =>
    onChange(isThemePreference(value) ? value : 'system'),
  );
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

/** Applies a theme to the document root, matching the pre-paint script in index.html. */
export function applyTheme(resolved: ResolvedTheme, root: HTMLElement = document.documentElement) {
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  root.style.colorScheme = resolved;
  root.ownerDocument
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      // A media-specific tag applies to one system scheme; the app's own
      // theme decides the visible chrome color for both.
      meta.content = THEME_CHROME_COLORS[resolved];
    });
}
