import { afterEach, describe, expect, it } from 'vitest';
import {
  THEME_CHROME_COLORS,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemePreference,
  resolveTheme,
  subscribeThemePreference,
  writeThemePreference,
} from './theme';

describe('theme preferences', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  });

  it('keeps the next-themes key and values of earlier versions', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readThemePreference()).toBe('dark');
    writeThemePreference('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('falls back to the system theme for missing or unknown values', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');
  });

  it('resolves the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('applies classes, color scheme and browser chrome color', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.media = '(prefers-color-scheme: light)';
    document.head.append(meta);

    applyTheme('dark');
    const root = document.documentElement;
    expect(root).toHaveClass('dark');
    expect(root).not.toHaveClass('light');
    expect(root.style.colorScheme).toBe('dark');
    expect(meta.content).toBe(THEME_CHROME_COLORS.dark);

    applyTheme('light');
    expect(root).toHaveClass('light');
    expect(root).not.toHaveClass('dark');
  });

  it('follows changes made in another tab', () => {
    const changes: string[] = [];
    const unsubscribe = subscribeThemePreference((value) => changes.push(value));
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'light' }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' }));
    expect(changes).toEqual(['dark', 'system']);
  });
});
