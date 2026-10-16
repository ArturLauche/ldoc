/**
 * Keyboard shortcut labels. Shortcuts are written as `Mod+Shift+Z`, where
 * `Mod` is ⌘ on Apple platforms and Ctrl elsewhere (TipTap's convention).
 */

type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as NavigatorWithUAData).userAgentData?.platform || navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /\b(Macintosh|iPhone|iPad)\b/.test(navigator.userAgent);
}

const APPLE_SYMBOLS: Record<string, string> = {
  Mod: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Enter: '↩',
};

const ARIA_NAMES: Record<string, string> = {
  Ctrl: 'Control',
  Alt: 'Alt',
  Shift: 'Shift',
  Enter: 'Enter',
};

function splitShortcut(shortcut: string): string[] {
  // A trailing `+` is the plus key itself (`Mod++`).
  const parts = shortcut.split('+');
  if (shortcut.endsWith('++')) parts.splice(-2, 2, '+');
  return parts.filter(Boolean);
}

/** Visible label: `⌘⇧Z` on Apple platforms, `Ctrl+Shift+Z` elsewhere. */
export function formatShortcut(shortcut: string, apple = isApplePlatform()): string {
  const parts = splitShortcut(shortcut);
  if (apple) return parts.map((part) => APPLE_SYMBOLS[part] ?? part.toUpperCase()).join('');
  return parts.map((part) => (part === 'Mod' ? 'Ctrl' : part.length === 1 ? part.toUpperCase() : part)).join('+');
}

/** Value for `aria-keyshortcuts`, e.g. `Control+Shift+Z` or `Meta+Shift+Z`. */
export function ariaKeyShortcut(shortcut: string, apple = isApplePlatform()): string {
  return splitShortcut(shortcut)
    .map((part) => (part === 'Mod' ? (apple ? 'Meta' : 'Control') : (ARIA_NAMES[part] ?? part.toUpperCase())))
    .join('+');
}
