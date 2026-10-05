import { describe, expect, it } from 'vitest';
import { parseCssColor, toHex } from './color';
import { extractExportDocumentFromHtml } from './model';
import { DOCUMENT_STYLE, flowLeaves, lineBoxPx, pageGeometry, resolveRunStyle, textBaseStyle } from './typography';

const blocks = (html: string) => extractExportDocumentFromHtml({ html, name: 'Doc', locale: 'en' }).blocks;

const gaps = (html: string, container: 'root' | 'cell' = 'root') =>
  flowLeaves(blocks(html), container).leaves.map((leaf) => leaf.spaceBefore);

describe('flowLeaves', () => {
  it('collapses margins like the editor (prose + editor CSS)', () => {
    // p → p: max(16 bottom, 20 top); h2 → p: prose zeroes the top margin after h2.
    expect(gaps('<p>A</p><p>B</p><h2>H</h2><p>C</p>')).toEqual([20, 20, 28, 12]);
    // After h2 a heading or image keeps its own top margin (editor rules win).
    expect(gaps('<h2>A</h2><h3>B</h3>')).toEqual([28, 24]);
    expect(gaps(`<h2>A</h2><img src="data:image/png;base64,AA==">`)).toEqual([28, 16]);
  });

  it('spaces list paragraphs by the kind of the outermost list', () => {
    // Bullet lists: first paragraph of a top-level item 1.25em, others 0.75em.
    expect(gaps('<ul><li><p>A</p><p>B</p><ul><li><p>C</p></li></ul></li></ul>')).toEqual([20, 16, 16]);
    expect(gaps('<ul><li><p>A</p><ul><li><p>B</p></li></ul></li><li><p>C</p></li></ul>')).toEqual([20, 16, 20]);
    // Ordered lists only style the first paragraph; the rest keep paragraph spacing.
    expect(gaps('<ol><li><p>A</p><p>B</p><ol><li><p>C</p></li></ol></li></ol>')).toEqual([20, 20, 20]);
    // Lists inside a quote are not top-level lists.
    expect(gaps('<blockquote><ul><li><p>A</p><p>B</p></li></ul></blockquote>')).toEqual([25.6, 20]);
  });

  it('marks the first leaf of each list item for numbering', () => {
    const { leaves } = flowLeaves(blocks('<ol start="3"><li><p>A</p><p>A2</p></li><li><p>B</p><ul><li>C</li></ul></li></ol>'));
    expect(leaves.map((leaf) => (leaf.listItem ? `${leaf.listItem.index}@${leaf.listItem.depth}/${leaf.listItem.bulletDepth}` : '-'))).toEqual([
      '0@1/0',
      '-',
      '1@1/0',
      '0@2/1',
    ]);
  });

  it('keeps both edges in table cells and scales em margins to the 14px text', () => {
    const flow = flowLeaves(blocks('<p>A</p><ul><li><p>B</p></li></ul>'), 'cell');
    expect(flow.leaves.map((leaf) => leaf.spaceBefore)).toEqual([DOCUMENT_STYLE.table.paragraphMarginTop, 17.5]);
    expect(flow.trailing).toBe(16);
  });

  it('does not collapse floats with surrounding margins', () => {
    expect(gaps('<p>A</p><img src="data:image/png;base64,AA==" data-align="left"><p>B</p>')).toEqual([20, 8, 20]);
  });
});

describe('run styles', () => {
  it('resolves editor weights, sizes and colors', () => {
    const body = textBaseStyle({ kind: 'body' });
    expect(resolveRunStyle({ bold: true }, undefined, body)).toMatchObject({ weight: 600, sizePx: 16 });
    expect(resolveRunStyle({ bold: true }, undefined, textBaseStyle({ kind: 'heading', level: 1 }))).toMatchObject({ weight: 900 });
    expect(resolveRunStyle({}, { href: 'https://example.com' }, body)).toMatchObject({ weight: 500, color: '2E3D52', underline: true });
    expect(resolveRunStyle({ code: true }, undefined, body)).toMatchObject({ sizePx: 14, weight: 600, family: { name: 'Courier New' } });
    expect(resolveRunStyle({ superscript: true, fontSize: '20px' }, undefined, body)).toMatchObject({ sizePx: 15, parentSizePx: 20, lineHeight: 0 });
    expect(textBaseStyle({ kind: 'cell', color: 'rgb(248, 250, 252)' }).color).toBe('F8FAFC');
  });

  it('computes CSS line boxes from the strut and inline boxes', () => {
    const body = textBaseStyle({ kind: 'body' });
    expect(lineBoxPx(body, [])).toBe(28);
    expect(lineBoxPx(body, [resolveRunStyle({ fontSize: '24px' }, undefined, body)])).toBe(42);
    expect(lineBoxPx(body, [resolveRunStyle({ superscript: true, fontSize: '40px' }, undefined, body)])).toBe(28);
  });

  it('uses Letter for English and A4 elsewhere', () => {
    expect(pageGeometry('en')).toMatchObject({ name: 'letter', widthPt: 612, contentWidthPx: 624 });
    expect(pageGeometry('de')).toMatchObject({ name: 'a4', widthPt: 595.28 });
  });
});

describe('colors', () => {
  it('parses CSS color syntaxes', () => {
    expect(parseCssColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseCssColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseCssColor('hsl(0, 100%, 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('color(srgb 1 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('navy')).toEqual({ r: 0, g: 0, b: 128, a: 1 });
    expect(parseCssColor('url(javascript:x)')).toBeNull();
  });

  it('flattens translucent colors on white for formats without alpha', () => {
    expect(toHex('rgba(0, 0, 0, 0.5)')).toBe('808080');
    // Fully transparent is no color at all.
    expect(toHex('transparent')).toBeNull();
    expect(toHex('nonsense')).toBeNull();
  });
});
