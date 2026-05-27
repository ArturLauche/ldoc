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

export async function exportDocument({
  html,
  name,
  locale,
  format,
}: ExportDocumentOptions): Promise<ExportResult> {
  const sanitizedHtml = sanitizeDocumentHtml(html);
  const documentModel = extractExportDocumentFromHtml({
    html: sanitizedHtml,
    name,
    locale,
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
