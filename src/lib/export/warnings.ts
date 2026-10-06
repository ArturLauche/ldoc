import type { ExportFormat, ExportWarning, ExportWarningCode } from './types';

export const defaultWarningMessages: Record<ExportWarningCode, string> = {
  'image-remote-cors':
    'A remote image could not be embedded because the image server blocked cross-origin access.',
  'image-fetch-failed': 'A remote image could not be downloaded and was replaced with alt text.',
  'image-format-unsupported': 'An image format is not supported by this export and was replaced with alt text.',
  'image-too-large': 'An image exceeded the safe export size limit and was replaced with alt text.',
  'image-decode-failed': 'An image could not be decoded and was replaced with alt text.',
  'image-svg-rasterized': 'An SVG image was converted to a bitmap before export.',
  'image-svg-placeholder': 'An SVG image was replaced with alt text.',
  'image-orientation-ignored': 'A photo could not be turned upright as it is shown, so it keeps its original orientation.',
  'image-not-embedded':
    'A remote image could not be embedded and was replaced with its alt text, linked to the image.',
  'font-unavailable':
    'A font could not be loaded, so text in it was exported with the default document font.',
  'font-substituted':
    'A font is not available to LWrite, so the PDF uses a similar standard font instead.',
  'font-not-embedded':
    'This format cannot embed fonts; text keeps its font names but shows in a substitute font where they are not installed.',
  'pdf-font-fallback': 'The PDF used a basic standard font because the embedded fonts could not be loaded.',
  'pdf-glyph-missing': 'Some characters have no glyph in any font LWrite can embed and were left out of the PDF.',
  'pdf-glyph-rasterized':
    'Some characters (such as emoji) have no embeddable font and were drawn as small images in the PDF.',
  'unicode-not-fully-supported': 'Some Unicode characters were represented with compatibility escapes.',
  'table-layout-simplified': 'A table was exported with simplified layout.',
  'graphic-layout-simplified':
    'A Smart Graphic was exported as a structured outline because its drawing could not be rendered.',
  'graphic-rendered-as-image':
    'Smart Graphics were embedded as pictures; their text is kept as alternative text.',
  'unsupported-style-dropped': 'Some styling was dropped because this format does not support it.',
  'link-not-supported-by-format': 'A hyperlink was exported as visible text because this format cannot keep links.',
};

export class WarningCollector {
  private readonly seen = new Set<string>();
  private readonly warnings: ExportWarning[] = [];

  constructor(private readonly format: ExportFormat) {}

  add(code: ExportWarningCode, detail?: string, message = defaultWarningMessages[code]): void {
    const key = `${code}:${detail ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.warnings.push({
      code,
      format: this.format,
      message,
      ...(detail !== undefined ? { detail } : {}),
    });
  }

  has(code: ExportWarningCode): boolean {
    return this.warnings.some((warning) => warning.code === code);
  }

  toArray(): ExportWarning[] {
    return [...this.warnings];
  }
}
