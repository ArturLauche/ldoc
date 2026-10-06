import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serveExportAssets } from '@/test/exportAssets';
import { ExportFontRegistry } from '../fonts/registry';
import { DOCUMENT_STYLE, resolveRunStyle, textBaseStyle } from '../typography';
import type { ExportAlignment } from '../types';
import { WarningCollector } from '../warnings';
import { PdfFontSet } from './fonts';
import { layoutInline, type InlineEnvironment } from './inline';

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => {
  assets = serveExportAssets();
});
afterEach(() => assets.restore());

async function environment(text: string): Promise<InlineEnvironment> {
  const warnings = new WarningCollector('pdf');
  const registry = new ExportFontRegistry(warnings);
  const base = textBaseStyle({ kind: 'body' });
  registry.note({ family: base.family, weight: 400, italic: false }, text);
  await registry.load({ instances: true, fallback: false });
  return { registry, fonts: new PdfFontSet(await PDFDocument.create()), warnings, rasterizer: null };
}

function layout(env: InlineEnvironment, text: string, width: number, align?: ExportAlignment) {
  const base = textBaseStyle({ kind: 'body' });
  const resolution = env.registry.resolve({ family: base.family, weight: 400, italic: false });
  return layoutInline(env, [{ text, style: resolveRunStyle({}, undefined, base) }], {
    base,
    baseMetrics: env.fonts.forLoaded(resolution.fonts[0]).metrics,
    ...(align ? { align } : {}),
    slotAt: () => ({ inset: 0, width }),
  });
}

const lineText = (line: { pieces: Array<{ text: string }> }) => line.pieces.map((piece) => piece.text).join('');

describe('layoutInline', () => {
  it('lays out lines with the editor line height', async () => {
    const env = await environment('Hello world');
    const [line] = layout(env, 'Hello world', 1000);
    expect(line.height).toBeCloseTo(DOCUMENT_STYLE.sizePx * DOCUMENT_STYLE.lineHeight, 5);
    expect(lineText(line)).toBe('Hello world');
  });

  it('keeps trailing spaces on the line like white-space: break-spaces', async () => {
    const env = await environment('aaa bbb ccc');
    const exact = layout(env, 'aaa bbb', 1000)[0].width;
    // "aaa bbb" fits exactly, but its trailing space does not: the line breaks after "aaa ".
    const lines = layout(env, 'aaa bbb ccc', exact);
    expect(lineText(lines[0])).toBe('aaa ');
    expect(lines.map(lineText).join('')).toBe('aaa bbb ccc');
    // With one more space of room, the space fits and "bbb" stays on the first line.
    const space = layout(env, 'aaa ', 1000)[0].width - layout(env, 'aaa', 1000)[0].width;
    expect(lineText(layout(env, 'aaa bbb ccc', exact + space)[0])).toBe('aaa bbb ');
  });

  it('breaks long words anywhere (overflow-wrap: anywhere)', async () => {
    const env = await environment('abcdefghijklmnopqrstuvwxyz');
    const lines = layout(env, 'abcdefghijklmnopqrstuvwxyz', 60);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.map(lineText).join('')).toBe('abcdefghijklmnopqrstuvwxyz');
    lines.forEach((line) => expect(line.width).toBeLessThanOrEqual(60.01));
  });

  it('justifies all lines but the last, stretching only inner spaces', async () => {
    const text = 'one two three four five six seven eight nine ten';
    const env = await environment(text);
    const lines = layout(env, text, 150, 'justify');
    expect(lines.length).toBeGreaterThan(1);
    lines.slice(0, -1).forEach((line) => expect(line.width).toBeCloseTo(150, 5));
    expect(lines[lines.length - 1].width).toBeLessThan(150);
  });

  it('centers and right-aligns lines within the available width', async () => {
    const env = await environment('Short');
    const [centered] = layout(env, 'Short', 300, 'center');
    const [right] = layout(env, 'Short', 300, 'right');
    expect(centered.offset).toBeCloseTo((300 - centered.width) / 2, 5);
    expect(right.offset).toBeCloseTo(300 - right.width, 5);
  });
});
