import type { ExportFormat, ExportWarning, ExportWarningCode } from './types';

export const defaultWarningMessages: Record<ExportWarningCode, string> = {
  'image-remote-cors':
    'A remote image could not be embedded because the image server blocked cross-origin access.',
  'image-fetch-failed': 'A remote image could not be downloaded and was replaced with alt text.',
  'image-format-unsupported': 'An image format is not supported by this export and was replaced with alt text.',
  'image-too-large': 'An image exceeded the safe export size limit and was replaced with alt text.',
  'image-decode-failed': 'An image could not be decoded and was replaced with alt text.',
  'image-svg-rasterized': 'An SVG image was rasterized before export.',
  'image-svg-placeholder': 'An SVG image was replaced with alt text.',
  'pdf-font-fallback': 'The PDF used a fallback font because the embedded Unicode font was unavailable.',
  'pdf-glyph-missing': 'Some characters could not be rendered by the selected PDF font.',
  'unicode-not-fully-supported': 'Some Unicode characters were represented with compatibility escapes.',
  'table-layout-simplified': 'A table was exported with simplified layout.',
  'graphic-layout-simplified':
    'A graphic was exported as a structured outline because this format cannot keep the visual layout.',
  'unsupported-style-dropped': 'Some styling was dropped because this format does not support it.',
  'rtf-basic-format': 'RTF is exported as a basic compatibility format.',
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
      detail,
    });
  }

  toArray(): ExportWarning[] {
    return [...this.warnings];
  }
}
