import type {
  ExportBlock,
  ExportImageBlock,
  ExportInlineMarks,
  ExportInlineRun,
  ExportLink,
} from './types';

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeXmlAttr(value: string): string {
  return escapeXml(value).replace(/\r?\n/g, ' ');
}

export function normalizeFontFamilyValue(value: string): string {
  return value.split(',')[0]?.trim().replace(/['"]/g, '') ?? '';
}

export function normalizeColorToHex(color?: string): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return hex
        .split('')
        .map((char) => char + char)
        .join('')
        .toUpperCase();
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return hex.toUpperCase();
    }
    return null;
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((part) => Number.isFinite(part))) {
      return parts
        .slice(0, 3)
        .map((value) => Math.max(0, Math.min(255, Math.round(value))))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    }
  }

  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = trimmed;
  return normalizeColorToHex(ctx.fillStyle);
}

export function resolvePtFromCssSize(value?: string): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const numeric = Number.parseFloat(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  if (trimmed.endsWith('pt')) return numeric;
  if (trimmed.endsWith('px')) return numeric * 0.75;
  if (trimmed.endsWith('rem')) return numeric * 12;
  if (trimmed.endsWith('em')) return numeric * 12;
  return numeric;
}

export function getVisibleTextFromRuns(runs: ExportInlineRun[], includeLinks = false): string {
  return normalizeRuns(runs)
    .map((run) => {
      if (!includeLinks || !run.link?.href || run.text.trim() === run.link.href.trim()) {
        return run.text;
      }
      return `${run.text} (${run.link.href})`;
    })
    .join('');
}

export function sameMarks(a: ExportInlineMarks, b: ExportInlineMarks): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strike === !!b.strike &&
    !!a.subscript === !!b.subscript &&
    !!a.superscript === !!b.superscript &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.highlight ?? '') === (b.highlight ?? '') &&
    (a.fontFamily ?? '') === (b.fontFamily ?? '') &&
    (a.fontSize ?? '') === (b.fontSize ?? '')
  );
}

export function sameLink(a?: ExportLink, b?: ExportLink): boolean {
  return (a?.href ?? '') === (b?.href ?? '') && (a?.title ?? '') === (b?.title ?? '');
}

export function normalizeRuns(runs: ExportInlineRun[]): ExportInlineRun[] {
  const normalized: ExportInlineRun[] = [];
  runs.forEach((run) => {
    if (!run.text) return;
    const last = normalized.at(-1);
    if (last && sameMarks(last.marks, run.marks) && sameLink(last.link, run.link)) {
      last.text += run.text;
      return;
    }
    normalized.push({
      text: run.text,
      marks: { ...run.marks },
      link: run.link ? { ...run.link } : undefined,
    });
  });
  return normalized;
}

export function hasVisibleText(runs: ExportInlineRun[]): boolean {
  return runs.some((run) => run.text.replace(/\s+/g, '').length > 0);
}

export function imagePlaceholderRuns(image: ExportImageBlock): ExportInlineRun[] {
  const label = image.alt.trim() || 'Image';
  return [{ text: `[Image: ${label}]`, marks: {} }];
}

export function walkBlocks(blocks: ExportBlock[], visit: (block: ExportBlock) => void): void {
  blocks.forEach((block) => {
    visit(block);
    if (block.type === 'list') {
      block.items.forEach((item) => walkBlocks(item.blocks, visit));
    }
    if (block.type === 'table') {
      block.rows.forEach((row) => row.cells.forEach((cell) => walkBlocks(cell.blocks, visit)));
    }
  });
}

export function walkRuns(blocks: ExportBlock[], visit: (run: ExportInlineRun) => void): void {
  walkBlocks(blocks, (block) => {
    if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote') {
      block.runs.forEach(visit);
    }
  });
}

export function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 0xfffffff;
  }
  return hash.toString(16);
}
