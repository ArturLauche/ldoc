import { describe, expect, it } from 'vitest';
import { ariaKeyShortcut, formatShortcut } from './shortcuts';

describe('shortcut labels', () => {
  it('uses symbols on Apple platforms and words elsewhere', () => {
    expect(formatShortcut('Mod+Shift+Z', true)).toBe('⌘⇧Z');
    expect(formatShortcut('Mod+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Mod+Alt+1', false)).toBe('Ctrl+Alt+1');
    expect(formatShortcut('Mod+/', true)).toBe('⌘/');
  });

  it('prints modifiers as keyboards in the interface language name them', () => {
    const german = { Ctrl: 'Strg', Shift: 'Umschalt', Alt: 'Alt' };
    expect(formatShortcut('Mod+Shift+Z', false, german)).toBe('Strg+Umschalt+Z');
    expect(formatShortcut('Mod+Alt+2', false, german)).toBe('Strg+Alt+2');
    // Apple symbols are the same in every language.
    expect(formatShortcut('Mod+Shift+Z', true, german)).toBe('⌘⇧Z');
  });

  it('keeps the plus key', () => {
    expect(formatShortcut('Mod++', false)).toBe('Ctrl++');
  });

  it('describes shortcuts for assistive technology', () => {
    expect(ariaKeyShortcut('Mod+B', false)).toBe('Control+B');
    expect(ariaKeyShortcut('Mod+Shift+Z', true)).toBe('Meta+Shift+Z');
  });
});
