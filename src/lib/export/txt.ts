import type { ExportBlock, ExportDocumentModel, ExportListBlock, ExportTableBlock } from './types';
import { buildTableGrid, getVisibleTextFromRuns, graphicToFallbackBlocks, imagePlaceholderRuns } from './shared';

/**
 * Plain text that keeps the document's structure readable: blank lines
 * between blocks, underlined headings, indented lists, aligned table columns,
 * quoted blockquotes, indented code, and links followed by their address.
 */
export function renderTxt(documentModel: ExportDocumentModel): Blob {
  const text = blocksToText(documentModel.blocks).join('\n');
  return new Blob([text], { type: 'text/plain' });
}

const RULE = '-'.repeat(40);

function textWidth(value: string): number {
  return Array.from(value).length;
}

/** Blocks separated by one blank line. */
function blocksToText(blocks: ExportBlock[]): string[] {
  const lines: string[] = [];
  blocks.forEach((block) => {
    const blockLines = blockToText(block);
    if (!blockLines.length) return;
    if (lines.length) lines.push('');
    lines.push(...blockLines);
  });
  return lines;
}

function blockToText(block: ExportBlock): string[] {
  switch (block.type) {
    case 'paragraph': {
      const text = getVisibleTextFromRuns(block.runs, true);
      return text.trim() ? text.split('\n') : [];
    }
    case 'heading': {
      const text = getVisibleTextFromRuns(block.runs, true).replace(/\s*\n\s*/g, ' ').trim();
      if (!text) return [];
      const level = block.level ?? 1;
      if (level === 1) return [text, '='.repeat(textWidth(text))];
      if (level === 2) return [text, '-'.repeat(textWidth(text))];
      return [text];
    }
    case 'blockquote':
      return blocksToText(block.blocks).map((line) => (line ? `> ${line}` : '>'));
    case 'code-block':
      return block.text.replace(/\t/g, '    ').split('\n').map((line) => (line ? `    ${line}` : ''));
    case 'horizontal-rule':
      return [RULE];
    case 'image':
      return [getVisibleTextFromRuns(imagePlaceholderRuns(block), true)];
    case 'table':
      return tableToText(block);
    case 'graphic':
      return blocksToText(graphicToFallbackBlocks(block));
    case 'list':
      return listToText(block);
  }
}

function listToText(block: ExportListBlock): string[] {
  const lines: string[] = [];
  block.items.forEach((item, index) => {
    const marker = block.ordered ? `${block.start + index}. ` : '- ';
    const indent = ' '.repeat(marker.length);
    // Items are compact; paragraphs inside one item keep a blank line.
    const itemLines = blocksToText(item.blocks);
    if (!itemLines.length) {
      lines.push(marker.trimEnd());
      return;
    }
    itemLines.forEach((line, lineIndex) => {
      if (lineIndex === 0) lines.push(`${marker}${line}`);
      else lines.push(line ? `${indent}${line}` : '');
    });
  });
  return lines;
}

function cellText(blocks: ExportBlock[]): string {
  return blocksToText(blocks)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Columns padded to a common width; a merged cell spans its columns, covered rows stay blank. */
function tableToText(table: ExportTableBlock): string[] {
  const grid = buildTableGrid(table);
  const texts = new Map(grid.cells.map((entry) => [entry, cellText(entry.cell.blocks)]));
  const widths = Array.from({ length: grid.columnCount }, () => 1);
  grid.cells.forEach((entry) => {
    if (entry.colSpan === 1) widths[entry.column] = Math.max(widths[entry.column], textWidth(texts.get(entry) ?? ''));
  });
  const lines = grid.slots.map((slots, row) => {
    const parts: string[] = [];
    for (let column = 0; column < grid.columnCount; ) {
      const entry = slots[column];
      const span = entry && entry.column === column ? entry.colSpan : 1;
      const value = entry && entry.column === column && entry.row === row ? (texts.get(entry) ?? '') : '';
      const width = widths.slice(column, column + span).reduce((sum, item) => sum + item, 0) + 3 * (span - 1);
      parts.push(value + ' '.repeat(Math.max(0, width - textWidth(value))));
      column += span;
    }
    return parts.join(' | ').trimEnd();
  });
  const headerRows = grid.slots.findIndex((slots) => !slots.every((entry) => entry?.cell.header));
  if (headerRows > 0) lines.splice(headerRows, 0, widths.map((width) => '-'.repeat(width)).join('-+-'));
  return lines;
}
