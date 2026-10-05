import { DOCUMENT_STYLE, resolveRunStyle, textBaseStyle, type RunStyle, type TextContext } from './typography';
import { resolveFamily } from './fonts/catalog';
import type { ExportFontRegistry } from './fonts/registry';
import { graphicToFallbackBlocks, imagePlaceholderRuns } from './shared';
import type { ExportBlock, ExportInlineRun } from './types';

/**
 * Visits every piece of document text with the context that decides its
 * appearance (heading level, table cell, quote). Exporters use it to learn
 * which fonts, weights and characters a document needs before loading any.
 */
export interface TextVisit {
  runs: ExportInlineRun[];
  context: TextContext;
}

export function visitDocumentText(
  blocks: ExportBlock[],
  visit: (entry: TextVisit) => void,
  options: { graphicFallbacks: boolean } = { graphicFallbacks: true },
  context: TextContext = { kind: 'body' },
): void {
  blocks.forEach((block) => {
    switch (block.type) {
      case 'paragraph':
        visit({ runs: block.runs, context: { ...context, kind: context.kind === 'cell' ? 'cell' : 'body' } });
        break;
      case 'heading':
        visit({ runs: block.runs, context: { ...context, kind: 'heading', level: block.level ?? 1 } });
        break;
      case 'code-block':
        visit({ runs: [{ text: block.text, marks: {} }], context: { kind: 'code-block' } });
        break;
      case 'blockquote':
        visitDocumentText(block.blocks, visit, options, { ...context, quote: true });
        break;
      case 'list':
        block.items.forEach((item) => visitDocumentText(item.blocks, visit, options, context));
        break;
      case 'table':
        block.rows.forEach((row) =>
          row.cells.forEach((cell) =>
            visitDocumentText(cell.blocks, visit, options, {
              kind: 'cell',
              header: cell.header,
              ...(cell.color ? { color: cell.color } : {}),
            }),
          ),
        );
        break;
      case 'image':
        visit({ runs: imagePlaceholderRuns(block), context: { ...context, kind: context.kind === 'cell' ? 'cell' : 'body' } });
        break;
      case 'graphic':
        if (options.graphicFallbacks || !block.scene) {
          visitDocumentText(graphicToFallbackBlocks(block), visit, options, context);
        }
        break;
      default:
        break;
    }
  });
}

/** Run styles for a visit, with generated text (code backticks, quote marks) the editor draws via CSS. */
export function styledRuns(entry: TextVisit, generated = true): Array<{ text: string; style: RunStyle; run: ExportInlineRun }> {
  const base = textBaseStyle(entry.context);
  return entry.runs.map((run) => {
    const style = resolveRunStyle(run.marks, run.link, base);
    const text =
      generated && style.code && entry.context.kind !== 'code-block'
        ? `${DOCUMENT_STYLE.inlineCode.before}${run.text}${DOCUMENT_STYLE.inlineCode.after}`
        : run.text;
    return { text, style, run };
  });
}

/** Records every styled string of the document in the font registry. */
export function noteDocumentFonts(
  registry: ExportFontRegistry,
  blocks: ExportBlock[],
  options: { generated: boolean; graphicFallbacks: boolean },
): void {
  visitDocumentText(
    blocks,
    (entry) => {
      styledRuns(entry, options.generated).forEach(({ text, style }) => {
        registry.note({ family: style.family, weight: style.weight, italic: style.italic }, text);
      });
      if (options.generated) {
        // List numbers and quote marks drawn in the paragraph's base style.
        const base = textBaseStyle(entry.context);
        registry.note({ family: base.family, weight: 400, italic: false }, '0123456789.• ');
        if (entry.context.quote) {
          registry.note(
            { family: base.family, weight: base.weight, italic: true },
            `${DOCUMENT_STYLE.blockquote.open}${DOCUMENT_STYLE.blockquote.close}`,
          );
        }
      }
    },
    options,
  );
  // Ellipsis and space for truncation/fallback text.
  registry.note({ family: resolveFamily(DOCUMENT_STYLE.family), weight: 400, italic: false }, ' ');
}
