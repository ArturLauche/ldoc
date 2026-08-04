import { buildExportFileName } from '@/lib/fileNames';
import { sanitizeDocumentHtml } from '@/lib/sanitizeDocumentHtml';
import { renderDocx } from './docx';
import { renderHtml } from './html';
import { prepareExportImages } from './images';
import { extractExportDocumentFromHtml } from './model';
import { renderOdt } from './odt';
import { renderRtf } from './rtf';
import { renderTxt } from './txt';
import { WarningCollector } from './warnings';
import type { ExportDocumentOptions, ExportFormat, ExportResult } from './types';

export type { ExportDocumentOptions, ExportFormat, ExportResult } from './types';

const EXPORT_FORMATS: readonly ExportFormat[] = ['txt', 'html', 'rtf', 'docx', 'odt', 'pdf'];
const MAX_EXPORT_HTML_CHARACTERS = 5_000_000;

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

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
  documentModel: ReturnType<typeof extractExportDocumentFromHtml>,
  warnings: WarningCollector,
): Promise<Blob> {
  switch (format) {
    case 'txt':
      return renderTxt(documentModel);
    case 'html':
      return renderHtml(documentModel);
    case 'rtf':
      return renderRtf(documentModel, warnings);
    case 'docx':
      await prepareExportImages(documentModel, warnings);
      return renderDocx(documentModel, warnings);
    case 'odt':
      await prepareExportImages(documentModel, warnings);
      return renderOdt(documentModel, warnings);
    case 'pdf': {
      await prepareExportImages(documentModel, warnings);
      const { renderPdf } = await import('./pdf');
      return renderPdf(documentModel, warnings);
    }
  }
}
