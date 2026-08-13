import type { ExportBlock, ExportDocumentModel, ExportInlineRun } from './types';
import {
  getVisibleTextFromRuns,
  imagePlaceholderRuns,
  normalizeColorToHex,
  normalizeFontFamilyValue,
  normalizeRuns,
  resolvePtFromCssSize,
  walkRuns,
  graphicToFallbackBlocks,
} from './shared';
import type { WarningCollector } from './warnings';

const DEFAULT_FONT_SIZE = 24;

export function renderRtf(documentModel: ExportDocumentModel, warnings: WarningCollector): Blob {
  warnings.add('rtf-basic-format');
  const rtf = buildRtfDocument(documentModel.blocks, warnings);
  return new Blob([rtf], { type: 'application/rtf' });
}

function buildRtfDocument(blocks: ExportBlock[], warnings: WarningCollector): string {
  const fonts = collectFonts(blocks);
  const colors = collectColors(blocks);
  const body = blocks.map((block) => renderBlock(block, fonts, colors, warnings, 0, 0)).join('\\par\n');
  return `{\\rtf1\\ansi\\uc1\\deff0${buildFontTable(fonts)}${buildColorTable(colors)}\n${body}}`;
}

function renderBlock(
  block: ExportBlock,
  fonts: Map<string, number>,
  colors: Map<string, number>,
  warnings: WarningCollector,
  listDepth: number,
  listIndex: number,
): string {
  if (block.type === 'horizontal-rule') return '\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\par';
  if (block.type === 'image') {
    warnings.add('image-format-unsupported', block.alt);
    return renderParagraph(imagePlaceholderRuns(block), block, fonts, colors);
  }
  if (block.type === 'table') {
    warnings.add('table-layout-simplified');
    return block.rows
      .map((row) =>
        renderParagraph(
          row.cells.flatMap((cell, index) => [
            ...(index ? [{ text: ' | ', marks: {} }] : []),
            { text: cell.blocks.map((cellBlock) => blockPlainText(cellBlock)).join(' '), marks: { bold: cell.header } },
          ]),
          undefined,
          fonts,
          colors,
        ),
      )
      .join('\\par\n');
  }
  if (block.type === 'graphic') {
    warnings.add('graphic-layout-simplified');
    return graphicToFallbackBlocks(block)
      .map((item) => renderBlock(item, fonts, colors, warnings, listDepth, listIndex))
      .join('\\par\n');
  }
  if (block.type === 'list') {
    return block.items
      .map((item, index) =>
        item.blocks
          .map((itemBlock, itemBlockIndex) => {
            const prefix =
              itemBlockIndex === 0
                ? block.ordered
                  ? `${block.start + index}. `
                  : '\\u8226? '
                : '  ';
            if (itemBlock.type === 'list') {
              return renderBlock(itemBlock, fonts, colors, warnings, listDepth + 1, index);
            }
            const runs = [{ text: prefix, marks: {} }, ...blockRuns(itemBlock, warnings)];
            return renderParagraph(runs, undefined, fonts, colors, listDepth);
          })
          .join('\\par\n'),
      )
      .join('\\par\n');
  }
  return renderParagraph(block.runs, block, fonts, colors, listDepth, listIndex);
}

function renderParagraph(
  runs: ExportInlineRun[],
  block: Extract<ExportBlock, { type: 'paragraph' | 'heading' | 'blockquote' | 'image' }> | undefined,
  fonts: Map<string, number>,
  colors: Map<string, number>,
  listDepth = 0,
  _listIndex = 0,
): string {
  const align =
    block?.align === 'center'
      ? '\\qc'
      : block?.align === 'right'
        ? '\\qr'
        : block?.align === 'justify'
          ? '\\qj'
          : '\\ql';
  const indent = listDepth ? `\\li${listDepth * 360}` : '';
  const fontSize = block?.type === 'heading' ? headingFontSize(block.level ?? 1) : DEFAULT_FONT_SIZE;
  return `\\pard${align}${indent}\\fs${fontSize} ${renderRuns(runs, fonts, colors, fontSize)}`;
}

function renderRuns(
  runs: ExportInlineRun[],
  fonts: Map<string, number>,
  colors: Map<string, number>,
  paragraphFontSize: number,
): string {
  return normalizeRuns(runs)
    .map((run) => {
      const rendered = renderRun(run, fonts, colors, paragraphFontSize);
      if (!run.link?.href) return rendered;
      return `{\\field{\\*\\fldinst HYPERLINK "${rtfEscapeAscii(run.link.href)}"}{\\fldrslt ${rendered}}}`;
    })
    .join('');
}

function renderRun(
  run: ExportInlineRun,
  fonts: Map<string, number>,
  colors: Map<string, number>,
  paragraphFontSize: number,
): string {
  const font = run.marks.fontFamily ? fonts.get(normalizeFontFamilyValue(run.marks.fontFamily)) ?? 0 : 0;
  const color = run.marks.color ? colors.get(normalizeColorToHex(run.marks.color) ?? '') ?? 0 : 0;
  const highlight = run.marks.highlight ? colors.get(normalizeColorToHex(run.marks.highlight) ?? '') ?? 0 : 0;
  const controls = [
    `\\f${font}`,
    `\\cf${color}`,
    `\\highlight${highlight}`,
    run.marks.bold ? '\\b' : '\\b0',
    run.marks.italic ? '\\i' : '\\i0',
    run.marks.underline ? '\\ul' : '\\ul0',
    run.marks.strike ? '\\strike' : '\\strike0',
    run.marks.superscript ? '\\super' : run.marks.subscript ? '\\sub' : '\\nosupersub',
    `\\fs${resolveRtfFontSize(run.marks.fontSize, paragraphFontSize)}`,
  ].join('');
  return `${controls} ${rtfEscapeUnicode(run.text)}\\nosupersub`;
}

function blockRuns(block: ExportBlock, warnings: WarningCollector): ExportInlineRun[] {
  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') return block.runs;
  if (block.type === 'image') {
    warnings.add('image-format-unsupported', block.alt);
    return imagePlaceholderRuns(block);
  }
  return [{ text: blockPlainText(block), marks: {} }];
}

function blockPlainText(block: ExportBlock): string {
  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') {
    return getVisibleTextFromRuns(block.runs, true);
  }
  if (block.type === 'image') return getVisibleTextFromRuns(imagePlaceholderRuns(block));
  if (block.type === 'horizontal-rule') return '----------------------------------------';
  if (block.type === 'table') {
    return block.rows.map((row) => row.cells.map((cell) => cell.blocks.map(blockPlainText).join(' ')).join(' | ')).join(' ');
  }
  if (block.type === 'list') {
    return block.items.map((item) => item.blocks.map(blockPlainText).join(' ')).join(' ');
  }
  if (block.type === 'graphic') {
    return graphicToFallbackBlocks(block).map(blockPlainText).join(' ');
  }
  return '';
}

function collectFonts(blocks: ExportBlock[]): Map<string, number> {
  const fonts = new Map<string, number>([['Arial', 0]]);
  walkRuns(blocks, (run) => {
    const font = run.marks.fontFamily ? normalizeFontFamilyValue(run.marks.fontFamily) : '';
    if (font && !fonts.has(font)) fonts.set(font, fonts.size);
  });
  return fonts;
}

function collectColors(blocks: ExportBlock[]): Map<string, number> {
  const colors = new Map<string, number>();
  walkRuns(blocks, (run) => {
    [run.marks.color, run.marks.highlight].forEach((value) => {
      const hex = normalizeColorToHex(value);
      if (hex && !colors.has(hex)) colors.set(hex, colors.size + 1);
    });
  });
  return colors;
}

function buildFontTable(fonts: Map<string, number>): string {
  const entries = Array.from(fonts.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([font, index]) => `{\\f${index} ${rtfEscapeAscii(font)};}`)
    .join('');
  return `{\\fonttbl${entries}}`;
}

function buildColorTable(colors: Map<string, number>): string {
  const entries = Array.from(colors.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([hex]) => {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return `\\red${r}\\green${g}\\blue${b};`;
    })
    .join('');
  return `{\\colortbl;${entries}}`;
}

function headingFontSize(level: number): number {
  if (level === 1) return 48;
  if (level === 2) return 36;
  return 28;
}

function resolveRtfFontSize(value: string | undefined, fallback: number): number {
  const points = resolvePtFromCssSize(value);
  return points ? Math.round(points * 2) : fallback;
}

function rtfEscapeAscii(text: string): string {
  return text.replace(/[\\{}"]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');
}

function rtfEscapeUnicode(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const char = text[i];
    if (char === '\\' || char === '{' || char === '}') {
      result += `\\${char}`;
    } else if (char === '\n') {
      result += '\\line ';
    } else if (code >= 0x20 && code <= 0x7e) {
      result += char;
    } else {
      const signed = code > 0x7fff ? code - 0x10000 : code;
      result += `\\u${signed}?`;
    }
  }
  return result;
}
