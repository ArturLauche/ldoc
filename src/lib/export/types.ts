import type { Locale } from '@/lib/translations';

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
  | 'pdf-font-fallback'
  | 'pdf-glyph-missing'
  | 'unicode-not-fully-supported'
  | 'table-layout-simplified'
  | 'graphic-layout-simplified'
  | 'unsupported-style-dropped'
  | 'rtf-basic-format'
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
  | ExportListBlock
  | ExportTableBlock
  | ExportImageBlock
  | ExportHorizontalRuleBlock
  | ExportGraphicBlock;

export type ExportTextBlockType = 'paragraph' | 'heading' | 'blockquote';
export type ExportAlignment = 'left' | 'center' | 'right' | 'justify';

export interface ExportTextBlock {
  type: ExportTextBlockType;
  runs: ExportInlineRun[];
  level?: 1 | 2 | 3;
  align?: ExportAlignment;
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
}

export interface ExportImageBlock {
  type: 'image';
  src: string;
  alt: string;
  widthPercent?: number;
  align?: ExportAlignment;
  prepared?: PreparedExportImage;
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
  color?: string;
  highlight?: string;
  fontFamily?: string;
  fontSize?: string;
}

export interface ExportLink {
  href: string;
  title?: string;
}
