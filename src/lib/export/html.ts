import type { ExportDocumentModel } from './types';
import { escapeHtmlText } from './shared';

export function renderHtml(documentModel: ExportDocumentModel): Blob {
  return new Blob([buildHtmlDocument(documentModel)], { type: 'text/html' });
}

function buildHtmlDocument(documentModel: ExportDocumentModel): string {
  return `<!DOCTYPE html>
<html lang="${documentModel.locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlText(documentModel.name)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #111827; }
    h1 { font-size: 2em; margin: 0.6em 0 0.4em; }
    h2 { font-size: 1.5em; margin: 0.6em 0 0.4em; }
    h3 { font-size: 1.17em; margin: 0.6em 0 0.4em; }
    p { margin: 0 0 0.75em; }
    ul, ol { padding-left: 1.5em; margin: 0 0 1em; }
    li { margin: 0.2em 0; }
    blockquote { border-left: 3px solid #e5e7eb; padding-left: 1em; color: #374151; margin: 1em 0; }
    mark { background-color: #fef08a; }
    img { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
    hr { border: none; border-top: 1px solid #d1d5db; margin: 1.5em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    .smart-diagram { border: 1px solid #d1d5db; border-radius: 10px; padding: 0.75rem; margin: 1rem 0; }
    .smart-diagram__title { font-weight: 600; margin-bottom: 0.5rem; }
    .smart-diagram__nodes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .smart-diagram__node { border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.25rem 0.75rem; background: #eef2ff; }
    .smart-diagram__connector { color: #64748b; }
  </style>
</head>
<body>
${documentModel.html}
</body>
</html>`;
}
