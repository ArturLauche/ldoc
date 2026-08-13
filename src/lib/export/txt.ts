import type { ExportBlock, ExportDocumentModel, ExportListBlock, ExportTableCell } from './types';
import { getVisibleTextFromRuns, imagePlaceholderRuns } from './shared';

export function renderTxt(documentModel: ExportDocumentModel): Blob {
  return new Blob([blocksToText(documentModel.blocks).join('\n')], { type: 'text/plain' });
}

function blocksToText(blocks: ExportBlock[], depth = 0): string[] {
  return blocks.flatMap((block) => blockToText(block, depth));
}

function blockToText(block: ExportBlock, depth: number): string[] {
  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') {
    const prefix = block.type === 'blockquote' ? '> ' : '';
    return [`${prefix}${getVisibleTextFromRuns(block.runs, true)}`];
  }
  if (block.type === 'horizontal-rule') return ['----------------------------------------'];
  if (block.type === 'image') return [getVisibleTextFromRuns(imagePlaceholderRuns(block), true)];
  if (block.type === 'table') {
    return block.rows.map((row) => row.cells.map(formatCellText).join(' | '));
  }
  if (block.type === 'list') return listToText(block, depth);
  return [];
}

function listToText(block: ExportListBlock, depth: number): string[] {
  const indent = '  '.repeat(depth);
  return block.items.flatMap((item, index) => {
    const marker = block.ordered ? `${block.start + index}. ` : '- ';
    const itemLines = blocksToText(item.blocks, depth + 1);
    if (!itemLines.length) return [`${indent}${marker}`];
    const [first, ...rest] = itemLines;
    return [`${indent}${marker}${first}`, ...rest.map((line) => `${indent}  ${line}`)];
  });
}

function formatCellText(cell: ExportTableCell): string {
  const value = blocksToText(cell.blocks)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return value || ' ';
}
