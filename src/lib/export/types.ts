import type { Locale } from '@/lib/translations';
import type { SmartGraphicModel } from '@/lib/smartGraphic';
import type { GraphicScene } from './graphics/scene';

export type ExportFormat = 'txt' | 'html' | 'rtf' | 'docx' | 'odt' | 'pdf';

export interface ExportDocumentOptions {
  html: string;
  name: string;
  locale: Locale;
  format: ExportFormat;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  warnings: ExportWarning[];
}

export type ExportWarningCode =
  | 'image-remote-cors'
  | 'image-fetch-failed'
  | 'image-format-unsupported'
  | 'image-too-large'
  | 'image-decode-failed'
  | 'image-svg-rasterized'
  | 'image-svg-placeholder'
  | 'image-not-embedded'
  | 'font-unavailable'
  | 'font-substituted'
  | 'font-not-embedded'
  | 'pdf-font-fallback'
  | 'pdf-glyph-missing'
  | 'pdf-glyph-rasterized'
  | 'unicode-not-fully-supported'
  | 'table-layout-simplified'
  | 'graphic-layout-simplified'
  | 'graphic-rendered-as-image'
  | 'unsupported-style-dropped'
  | 'link-not-supported-by-format';

export interface ExportWarning {
  code: ExportWarningCode;
  format: ExportFormat;
  message: string;
  detail?: string;
}

export interface ExportDocumentModel {
  html: string;
  name: string;
  locale: Locale;
  blocks: ExportBlock[];
}

export type ExportBlock =
  | ExportTextBlock
  | ExportBlockquoteBlock
  | ExportCodeBlock
  | ExportListBlock
  | ExportTableBlock
  | ExportImageBlock
  | ExportHorizontalRuleBlock
  | ExportGraphicBlock;

export type ExportTextBlockType = 'paragraph' | 'heading';
export type ExportAlignment = 'left' | 'center' | 'right' | 'justify';

/** A paragraph or heading: one run of inline content. */
export interface ExportTextBlock {
  type: ExportTextBlockType;
  runs: ExportInlineRun[];
  level?: 1 | 2 | 3;
  align?: ExportAlignment;
}

/** A quotation; contains paragraphs, lists and other blocks, like the editor's node. */
export interface ExportBlockquoteBlock {
  type: 'blockquote';
  blocks: ExportBlock[];
}

/** Preformatted code; whitespace and line breaks are significant. */
export interface ExportCodeBlock {
  type: 'code-block';
  text: string;
}

export interface ExportListBlock {
  type: 'list';
  ordered: boolean;
  start: number;
  items: ExportListItem[];
}

export interface ExportListItem {
  blocks: ExportBlock[];
}

export interface ExportTableBlock {
  type: 'table';
  rows: ExportTableRow[];
  borders?: 'visible' | 'hidden';
  /** Column widths in CSS px from the editor's column resizing (null = flexible). */
  columnWidths?: Array<number | null>;
  /** True when every column has a width: the table is that wide instead of filling the page. */
  fixedWidth?: boolean;
}

export interface ExportTableRow {
  cells: ExportTableCell[];
}

export interface ExportTableCell {
  header: boolean;
  colSpan: number;
  rowSpan: number;
  blocks: ExportBlock[];
  backgroundColor?: string;
  /** Text color the editor applies on filled cells for contrast. */
  color?: string;
  align?: ExportAlignment;
}

export interface ExportGraphicItem {
  label: string;
  children: ExportGraphicItem[];
}

export interface ExportGraphicBlock {
  type: 'graphic';
  layoutId: string;
  title: string;
  items: ExportGraphicItem[];
  /** The normalized model, for re-rendering and lossless HTML round trips. */
  model?: SmartGraphicModel;
  /** Vector drawing captured from the editor's renderer (browser only). */
  scene?: GraphicScene;
  /** Raster rendition of `scene` for formats without vector support. */
  raster?: PreparedExportImage;
  /** SVG rendition of `scene` with text as outlines (office formats). */
  svg?: Uint8Array;
}

export interface ExportImageBlock {
  type: 'image';
  src: string;
  alt: string;
  /** Width as % of the text column (editor `data-width`). */
  widthPercent?: number;
  align?: ExportAlignment;
  /** Left/right images float with text wrapping beside them, as in the editor. */
  float?: 'left' | 'right';
  prepared?: PreparedExportImage;
  /** Original bytes, kept for HTML export when they are a web-safe format. */
  original?: { bytes: Uint8Array; mimeType: string };
}

export interface PreparedExportImage {
  bytes: Uint8Array;
  mimeType: ExportImageMimeType;
  extension: 'png' | 'jpg' | 'jpeg';
  width: number;
  height: number;
}

export type ExportImageMimeType = 'image/png' | 'image/jpeg' | 'image/jpg';

export interface ExportHorizontalRuleBlock {
  type: 'horizontal-rule';
}

export interface ExportInlineRun {
  text: string;
  marks: ExportInlineMarks;
  link?: ExportLink;
}

export interface ExportInlineMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  /** Inline code (`<code>`). */
  code?: boolean;
  color?: string;
  highlight?: string;
  /** First family of the CSS `font-family` value. */
  fontFamily?: string;
  /** CSS font-size value (px, pt, em, rem, %). */
  fontSize?: string;
  /** CSS line-height value set with the spacing control. */
  lineHeight?: string;
}

export interface ExportLink {
  href: string;
  title?: string;
}
