import { describe, expect, it } from 'vitest';
import { ariaKeyShortcut, formatShortcut, formatShortcutParts } from './shortcuts';

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

describe('shortcut key parts', () => {
  it('splits combinations into one part per key', () => {
    expect(formatShortcutParts('Mod+Shift+Z', false)).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(formatShortcutParts('Mod+Shift+Z', true)).toEqual(['⌘', '⇧', 'Z']);
    expect(formatShortcutParts('Tab', false)).toEqual(['Tab']);
    expect(formatShortcutParts('Ctrl+/', true)).toEqual(['⌃', '/']);
  });

  it('names modifiers in the interface language', () => {
    const german = { Ctrl: 'Strg', Shift: 'Umschalt', Alt: 'Alt' };
    expect(formatShortcutParts('Mod+Shift+Enter', false, german)).toEqual([
      'Strg',
      'Umschalt',
      'Enter',
    ]);
  });

  it('agrees with the combined label', () => {
    const german = { Ctrl: 'Strg', Shift: 'Umschalt', Alt: 'Alt' };
    for (const apple of [true, false]) {
      for (const shortcut of ['Mod+Shift+Z', 'Mod+/', 'Tab', 'Shift+Enter', 'Mod+Alt+C']) {
        expect(formatShortcut(shortcut, apple, german)).toBe(
          formatShortcutParts(shortcut, apple, german).join(apple ? '' : '+'),
        );
      }
    }
  });
});
