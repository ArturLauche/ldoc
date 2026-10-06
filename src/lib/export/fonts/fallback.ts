import notoRegularUrl from '@/assets/fonts/NotoSans-Regular.ttf?url';
import notoBoldUrl from '@/assets/fonts/NotoSans-Bold.ttf?url';
import notoItalicUrl from '@/assets/fonts/NotoSans-Italic.ttf?url';
import notoBoldItalicUrl from '@/assets/fonts/NotoSans-BoldItalic.ttf?url';

/**
 * Bundled Noto Sans, used where the selected family has no glyph (Greek,
 * Cyrillic, symbols outside the self-hosted latin subsets), like a browser's
 * system fallback. It has real italic faces.
 */
export const FALLBACK_FAMILY = 'Noto Sans';

export function fallbackFontUrl(bold: boolean, italic: boolean): string {
  if (bold && italic) return notoBoldItalicUrl;
  if (bold) return notoBoldUrl;
  if (italic) return notoItalicUrl;
  return notoRegularUrl;
}
