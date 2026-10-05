import { resolveFamily } from '../fonts/catalog';
import type { ExportFontRegistry } from '../fonts/registry';
import { shapeText } from '../fonts/shaping';
import type { GraphicScene, SceneItem, SceneText } from './scene';

function visitText(items: SceneItem[], visit: (text: SceneText) => void): void {
  items.forEach((item) => {
    if (item.kind === 'text') visit(item);
    else if (item.kind === 'group') visitText(item.items, visit);
  });
}

/** Records the fonts a captured graphic draws its labels with. */
export function noteSceneFonts(registry: ExportFontRegistry, scene: GraphicScene): void {
  visitText(scene.items, (text) => {
    registry.note({ family: resolveFamily(text.font.family), weight: text.font.weight, italic: text.font.italic }, text.text);
  });
}

const SKEW = 0.25;
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * SVG path data for a label drawn with the export's fonts, positioned like
 * the browser laid it out. Returns '' when a character has no font (the SVG
 * then keeps a `<text>` element for it) — callers fall back to text then.
 */
export function outlineSceneText(registry: ExportFontRegistry, text: SceneText): string | null {
  const resolution = registry.resolve({ family: resolveFamily(text.font.family), weight: text.font.weight, italic: text.font.italic });
  const segments = shapeText(text.text, resolution, registry.fallbackFor(text.font.weight, text.font.italic));
  if (!segments.length || segments.some((segment) => !segment.font && segment.text.trim())) return null;
  const size = text.font.size;
  const width = segments.reduce(
    (sum, segment) => sum + (segment.font ? segment.glyphs.reduce((total, glyph) => total + glyph.advance, 0) * (size / segment.font.font.unitsPerEm) : 0),
    0,
  );
  let pen = text.anchor === 'middle' ? text.x - width / 2 : text.anchor === 'end' ? text.x - width : text.x;
  const skew = resolution.syntheticItalic ? SKEW : 0;
  const parts: string[] = [];
  segments.forEach((segment) => {
    if (!segment.font) return;
    const font = segment.font;
    const scale = size / font.font.unitsPerEm;
    segment.glyphs.forEach((glyph) => {
      const ox = pen + glyph.xOffset * scale;
      const oy = text.y - glyph.yOffset * scale;
      const commands = font.font.getGlyph(glyph.id).path.commands;
      // Font units are y-up; SVG is y-down. Synthetic italics shear like the browser.
      const map = (x: number, y: number) => `${round(ox + x * scale + y * scale * skew)} ${round(oy - y * scale)}`;
      commands.forEach(({ command, args }) => {
        if (command === 'moveTo') parts.push(`M${map(args[0], args[1])}`);
        else if (command === 'lineTo') parts.push(`L${map(args[0], args[1])}`);
        else if (command === 'quadraticCurveTo') parts.push(`Q${map(args[0], args[1])} ${map(args[2], args[3])}`);
        else if (command === 'bezierCurveTo') parts.push(`C${map(args[0], args[1])} ${map(args[2], args[3])} ${map(args[4], args[5])}`);
        else parts.push('Z');
      });
      pen += glyph.advance * scale;
    });
  });
  return parts.join('');
}
