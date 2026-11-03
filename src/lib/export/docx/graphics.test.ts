import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { serveExportAssets } from '@/test/exportAssets';
import { createStarterGraphic } from '@/lib/smartGraphic';
import { renderDocx } from './index';
import { emu } from './parts';
import { roundedRectPath, type GraphicScene, type SceneText } from '../graphics/scene';
import { frameScene } from '../graphics/renditions';
import { pageGeometry } from '../typography';
import type { ExportDocumentModel, ExportGraphicBlock } from '../types';
import { WarningCollector } from '../warnings';

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
};
const blue = { r: 20, g: 80, b: 210, a: 1 };
const label: SceneText = {
  kind: 'text', text: 'Plan <Build> & Ship', x: 180, y: 65, width: 150, anchor: 'middle',
  font: { family: 'Inter', weight: 600, italic: true, size: 20 }, color: blue,
};
const scene: GraphicScene = {
  width: 360, height: 120,
  items: [
    { kind: 'shape', path: roundedRectPath(10, 10, 340, 100), fill: blue },
    { kind: 'shape', path: [['M', 10, 110], ['C', 30, 80, 330, 80, 350, 110]], stroke: { color: blue, width: 2, dash: [4, 2], cap: 'round', join: 'round' } },
    label,
  ],
};

function graphic(drawing: GraphicScene | undefined = scene): ExportGraphicBlock {
  return {
    type: 'graphic', layoutId: 'process-chevron', title: 'Plan & deliver',
    model: createStarterGraphic('process-chevron'),
    items: [{ label: label.text, children: [{ label: 'Nested step', children: [] }] }],
    ...(drawing ? { scene: drawing } : {}),
  };
}

function elements(root: Document | Element, prefix: keyof typeof NS, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(NS[prefix], name));
}

async function exportModel(blocks: ExportDocumentModel['blocks'], direction: 'ltr' | 'rtl' = 'ltr') {
  const warnings = new WarningCollector('docx');
  const blob = await renderDocx({ html: '', name: 'Editable graphic', locale: 'en', direction, blocks }, warnings);
  expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
  return { zip, xml, document, warnings };
}

let assets: ReturnType<typeof serveExportAssets>;
beforeEach(() => { assets = serveExportAssets(); });
afterEach(() => assets.restore());

describe('editable DOCX Smart Graphics', () => {
  it('exports native paths and real editable text, embeds graphic-only fonts, and writes no pictures', async () => {
    const { zip, document, warnings } = await exportModel([graphic()]);
    expect(elements(document, 'wpg', 'wgp')).toHaveLength(1);
    const group = elements(document, 'wpg', 'wgp')[0];
    expect(elements(group, 'wps', 'wsp')).toHaveLength(4); // frame, card, curve, label
    expect(elements(group, 'a', 'custGeom')).toHaveLength(3);
    expect(elements(group, 'a', 'cubicBezTo')).not.toHaveLength(0);
    expect(elements(group, 'a', 'custDash')).toHaveLength(1);
    const box = elements(group, 'w', 'txbxContent')[0];
    expect(box.textContent).toBe(label.text);
    expect(elements(box, 'w', 'rFonts')[0].getAttributeNS(NS.w, 'ascii')).toBe('Inter');
    expect(elements(box, 'w', 'b')).toHaveLength(1);
    expect(elements(box, 'w', 'i')).toHaveLength(1);
    expect(elements(document, 'w', 'drawing')).toHaveLength(1);
    expect(Object.keys(zip.files).filter((path) => path.startsWith('word/media/'))).toEqual([]);
    expect(await zip.file('word/fontTable.xml')!.async('string')).toContain('w:name="Inter"');
    expect(Object.keys(zip.files).some((path) => path.endsWith('.odttf'))).toBe(true);
    expect(warnings.toArray()).toEqual([]);
  });

  it('provides a non-image, editable legacy fallback and unique object ids across repeated groups', async () => {
    const { document } = await exportModel([graphic(), graphic()]);
    const alternates = elements(document, 'mc', 'AlternateContent');
    expect(alternates).toHaveLength(2);
    for (const alternate of alternates) {
      expect(alternate.parentElement?.localName).toBe('r');
      expect(elements(alternate, 'mc', 'Choice')[0].getAttribute('Requires')).toBe('wpg');
      const fallback = elements(alternate, 'mc', 'Fallback')[0];
      expect(elements(fallback, 'w', 'pict')).toHaveLength(1);
      expect(elements(fallback, 'w', 'txbxContent')[0].textContent).toContain('Nested step');
      expect(elements(fallback, 'w', 'txbxContent')[0].textContent).toContain(label.text);
    }
    const ids = [...elements(document, 'wps', 'cNvPr'), ...elements(document, 'wp', 'docPr')].map((element) => element.getAttribute('id'));
    expect(new Set(ids).size).toBe(ids.length);
    // The group directly inside graphicData MUST NOT have cNvPr (MS-ODRAWXML).
    expect(elements(document, 'wpg', 'cNvPr')).toHaveLength(0);
  });

  it('scales text and shapes together in narrow cells and fits tall groups to a page', async () => {
    const tallScene = { ...scene, height: 2400 };
    const { document } = await exportModel([
      graphic(),
      { type: 'table', columnWidths: [180], rows: [{ cells: [{ header: false, colSpan: 1, rowSpan: 1, blocks: [graphic()] }] }] },
      graphic(tallScene),
    ]);
    const sizes = elements(document, 'wpg', 'wgp').map((group) => Number(elements(group, 'w', 'sz')[0].getAttributeNS(NS.w, 'val')));
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    const extents = elements(document, 'wp', 'extent');
    expect(Number(extents[0].getAttribute('cx'))).toBe(emu(pageGeometry('en').contentWidthPx));
    expect(Number(extents[1].getAttribute('cx'))).toBeLessThanOrEqual(emu(180));
    expect(Number(extents[2].getAttribute('cy'))).toBeLessThanOrEqual(emu(pageGeometry('en').contentHeightPt / 0.75));
    const framed = frameScene(scene);
    expect(Number(extents[0].getAttribute('cy')) / Number(extents[0].getAttribute('cx'))).toBeCloseTo(framed.height / framed.width);
  });

  it('preserves alpha, gradients, stroke and drop shadows and reports unsupported clipping/soft shadows', async () => {
    const effects: GraphicScene = { ...scene, items: [{ kind: 'group', opacity: 0.5, clip: roundedRectPath(0, 0, 100, 100), items: [
      { kind: 'shape', path: roundedRectPath(0, 0, 100, 100), fill: { kind: 'linear', x1: 0, y1: 0, x2: 100, y2: 100, stops: [{ offset: 0, color: blue }, { offset: 1, color: { ...blue, a: 0.5 } }] }, shadow: { dx: 2, dy: 3, blur: 4, spread: 0, color: blue } },
      { kind: 'shape', path: roundedRectPath(0, 0, 100, 100), fill: blue, blur: 4 },
      label,
    ] }] };
    const { document, warnings } = await exportModel([graphic(effects)]);
    expect(elements(document, 'a', 'gradFill')).toHaveLength(1);
    expect(elements(document, 'a', 'alpha').map((element) => element.getAttribute('val'))).toEqual(expect.arrayContaining(['50000', '25000']));
    expect(elements(document, 'a', 'outerShdw')).toHaveLength(1);
    expect(elements(document, 'wps', 'wsp')).toHaveLength(3);
    expect(warnings.toArray().map((warning) => warning.detail)).toEqual(['Smart Graphic clipping', 'Smart Graphic soft shadows']);
    expect(warnings.has('graphic-rendered-as-image')).toBe(false);
  });

  it('keeps RTL labels as logical, editable Word text', async () => {
    const { document } = await exportModel([graphic({ ...scene, items: [{ ...label, text: 'مرحبا بالعالم', anchor: 'end' }] })], 'rtl');
    const box = elements(elements(document, 'wpg', 'wgp')[0], 'w', 'txbxContent')[0];
    expect(box.textContent).toBe('مرحبا بالعالم');
    expect(elements(box, 'w', 'bidi')).toHaveLength(1);
    expect(elements(box, 'w', 'rtl')).toHaveLength(1);
    expect(elements(box, 'w', 'jc')[0].getAttributeNS(NS.w, 'val')).toBe('right');
  });

  it('retains the structured outline when browser scene capture is unavailable', async () => {
    const block = graphic();
    delete block.scene;
    const { document, warnings } = await exportModel([block]);
    expect(elements(document, 'wpg', 'wgp')).toHaveLength(0);
    expect(document.documentElement.textContent).toContain('Nested step');
    expect(warnings.has('graphic-layout-simplified')).toBe(true);
  });
});
