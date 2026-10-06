import { buildExportFileName } from '@/lib/fileNames';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import { prepareGraphicScenes } from './graphics/prepare';
import { prepareExportImages } from './images';
import { extractExportDocumentFromHtml } from './model';
import { renderTxt } from './txt';
import { EDITOR_COLUMN_WIDTH, pageGeometry } from './typography';
import { WarningCollector } from './warnings';
import type { ExportDocumentModel, ExportDocumentOptions, ExportFormat, ExportResult } from './types';

export type { ExportDocumentOptions, ExportFormat, ExportResult } from './types';

const EXPORT_FORMATS: readonly ExportFormat[] = ['txt', 'html', 'rtf', 'docx', 'odt', 'pdf'];
const MAX_EXPORT_HTML_CHARACTERS = 5_000_000;

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

/**
 * Exports editor HTML. Every format reads the same sanitized document model;
 * images and Smart Graphic drawings are prepared once per export, and heavy
 * format code (fonts, ZIP, PDF) is loaded only when that format is chosen.
 */
export async function exportDocument({
  html,
  name,
  locale,
  format,
}: ExportDocumentOptions): Promise<ExportResult> {
  if (!isExportFormat(format)) {
    throw new Error('Unsupported export format.');
  }

  if (typeof html !== 'string') {
    throw new Error('Nothing to export.');
  }

  if (html.length > MAX_EXPORT_HTML_CHARACTERS) {
    throw new Error('This document is too large to export.');
  }

  const sanitizedHtml = sanitizeDocumentHtml(html);
  const documentModel = extractExportDocumentFromHtml({
    html: sanitizedHtml,
    name: typeof name === 'string' ? name : '',
    locale: typeof locale === 'string' && locale ? locale : 'en',
  });
  const warnings = new WarningCollector(format);

  const blob = await renderFormat(format, documentModel, warnings);

  return {
    blob,
    fileName: buildExportFileName(name, format),
    warnings: warnings.toArray(),
  };
}

async function renderFormat(
  format: ExportFormat,
  documentModel: ExportDocumentModel,
  warnings: WarningCollector,
): Promise<Blob> {
  if (format === 'txt') return renderTxt(documentModel);
  const columnWidth = format === 'html' ? EDITOR_COLUMN_WIDTH : pageGeometry(documentModel.locale).contentWidthPx;
  await Promise.all([
    prepareExportImages(documentModel, warnings, { mode: format === 'html' ? 'html' : 'raster' }),
    prepareGraphicScenes(documentModel, columnWidth, documentModel.locale),
  ]);
  switch (format) {
    case 'html': {
      const { renderHtml } = await import('./html');
      return renderHtml(documentModel, warnings);
    }
    case 'rtf': {
      const { renderRtf } = await import('./rtf');
      return renderRtf(documentModel, warnings);
    }
    case 'docx': {
      const { renderDocx } = await import('./docx');
      return renderDocx(documentModel, warnings);
    }
    case 'odt': {
      const { renderOdt } = await import('./odt');
      return renderOdt(documentModel, warnings);
    }
    case 'pdf': {
      const { renderPdf } = await import('./pdf');
      return renderPdf(documentModel, warnings);
    }
  }
}
