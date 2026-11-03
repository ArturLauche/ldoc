import { hasRtlText } from '../bidi';
import { toHex, type RgbaColor } from '../color';
import { resolveFamily, type ResolvedFamily } from '../fonts/catalog';
import type { ExportFontRegistry } from '../fonts/registry';
import {
  isFinitePath,
  isGradient,
  type GraphicScene,
  type PathCommand,
  type SceneItem,
  type ScenePaint,
  type SceneShape,
  type SceneText,
} from '../graphics/scene';
import { escapeXml, escapeXmlAttr } from '../shared';
import type { WarningCollector } from '../warnings';
import { emu, halfPoints, twips } from './parts';

export const WORD_GROUP_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup';
export const WORD_SHAPE_NS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Control points conservatively bound Bézier curves, including open connectors. */
function pathBounds(path: PathCommand[]): Bounds | null {
  if (!path.length || !isFinitePath(path)) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const command of path) {
    for (let index = 1; index < command.length; index += 2) {
      xs.push(command[index] as number);
      ys.push(command[index + 1] as number);
    }
  }
  if (!xs.length) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(1 / 9525, Math.max(...xs) - x), height: Math.max(1 / 9525, Math.max(...ys) - y) };
}

/** Scale a shape's scene bounds into the group's EMU coordinate space. */
function transform(box: Bounds, scale: number): string {
  return `<a:xfrm><a:off x="${emu(box.x * scale)}" y="${emu(box.y * scale)}"/><a:ext cx="${Math.max(1, emu(box.width * scale))}" cy="${Math.max(1, emu(box.height * scale))}"/></a:xfrm>`;
}

/** Keep RGB channels intact and encode combined paint/group opacity as DrawingML alpha. */
function colorXml(color: RgbaColor, opacity: number): string {
  const hex = toHex({ ...color, a: 1 });
  const alpha = Math.round(Math.max(0, Math.min(1, color.a * opacity)) * 100000);
  return `<a:srgbClr val="${hex}">${alpha < 100000 ? `<a:alpha val="${alpha}"/>` : ''}</a:srgbClr>`;
}

/** Translate a scene fill into native no-fill, solid, or linear-gradient properties. */
function fillXml(paint: ScenePaint | undefined, opacity: number): string {
  if (!paint) return '<a:noFill/>';
  if (!isGradient(paint)) return `<a:solidFill>${colorXml(paint, opacity)}</a:solidFill>`;
  const stops = paint.stops.map((stop) => `<a:gs pos="${Math.round(Math.max(0, Math.min(1, stop.offset)) * 100000)}">${colorXml(stop.color, opacity)}</a:gs>`).join('');
  const angle = ((Math.atan2(paint.y2 - paint.y1, paint.x2 - paint.x1) * 180 / Math.PI) + 360) % 360;
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${Math.round(angle * 60000)}" scaled="0"/></a:gradFill>`;
}

/** Rebase scene paths to the shape's local bounds while preserving editable Bézier segments. */
function geometryXml(path: PathCommand[], box: Bounds, scale: number, filled: boolean): string {
  const point = (x: number, y: number) => `<a:pt x="${emu((x - box.x) * scale)}" y="${emu((y - box.y) * scale)}"/>`;
  const commands = path.map((command) => {
    switch (command[0]) {
      case 'M': return `<a:moveTo>${point(command[1], command[2])}</a:moveTo>`;
      case 'L': return `<a:lnTo>${point(command[1], command[2])}</a:lnTo>`;
      case 'C': return `<a:cubicBezTo>${point(command[1], command[2])}${point(command[3], command[4])}${point(command[5], command[6])}</a:cubicBezTo>`;
      case 'Z': return '<a:close/>';
    }
  }).join('');
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.max(1, emu(box.width * scale))}" h="${Math.max(1, emu(box.height * scale))}"${filled ? '' : ' fill="none"'}>${commands}</a:path></a:pathLst></a:custGeom>`;
}

/** Express dashes in stroke-width percentages; a zero-width stroke remains invisible. */
function strokeXml(shape: SceneShape, opacity: number, scale: number): string {
  const stroke = shape.stroke;
  if (!stroke || !Number.isFinite(stroke.width) || stroke.width <= 0) return '<a:ln><a:noFill/></a:ln>';
  const dashWidth = Math.max(1 / 9525, stroke.width);
  const dash = stroke.dash?.length
    ? `<a:custDash>${stroke.dash.filter((_value, index) => index % 2 === 0).map((length, index) => `<a:ds d="${Math.max(1, Math.round(length / dashWidth * 100000))}" sp="${Math.max(1, Math.round((stroke.dash?.[index * 2 + 1] ?? length) / dashWidth * 100000))}"/>`).join('')}</a:custDash>`
    : '';
  const join = stroke.join === 'round' ? '<a:round/>' : stroke.join === 'bevel' ? '<a:bevel/>' : '<a:miter/>';
  const cap = stroke.cap === 'round' ? 'rnd' : stroke.cap === 'square' ? 'sq' : 'flat';
  return `<a:ln w="${Math.max(1, emu(stroke.width * scale))}" cap="${cap}"><a:solidFill>${colorXml(stroke.color, opacity)}</a:solidFill>${dash}${join}</a:ln>`;
}

/**
 * Native Word 2010+ group: paths stay freeform shapes and each captured line
 * stays a real Word text box. All coordinates AND text sizes are scaled into
 * the column, so shrinking a graphic in a cell also shrinks its labels.
 * This translates the captured scene, never recreates a Smart Graphic layout.
 */
export function editableGraphicXml(
  scene: GraphicScene,
  width: number,
  options: {
    nextId: () => number;
    families: Map<string, ResolvedFamily>;
    registry: ExportFontRegistry;
    warnings: WarningCollector;
  },
): string {
  const scale = width / scene.width;
  /** Serialize a freeform shape, reporting geometry/effects that cannot be represented. */
  const visual = (item: SceneShape, opacity: number): string => {
    const box = pathBounds(item.path);
    if (!box) {
      if (item.path.length) options.warnings.add('unsupported-style-dropped', 'Smart Graphic invalid geometry');
      return '';
    }
    if (item.blur) {
      options.warnings.add('unsupported-style-dropped', 'Smart Graphic soft shadows');
      return '';
    }
    const id = options.nextId();
    let effect = '';
    if (item.shadow) {
      const shadow = item.shadow;
      const angle = (Math.atan2(shadow.dy, shadow.dx) * 180 / Math.PI + 360) % 360;
      effect = `<a:effectLst><a:outerShdw blurRad="${emu(shadow.blur * scale)}" dist="${emu(Math.hypot(shadow.dx, shadow.dy) * scale)}" dir="${Math.round(angle * 60000)}" rotWithShape="0">${colorXml(shadow.color, opacity)}</a:outerShdw></a:effectLst>`;
      if (shadow.spread) options.warnings.add('unsupported-style-dropped', 'Smart Graphic shadow spread');
    }
    return `<wps:wsp><wps:cNvPr id="${id}" name="Graphic shape ${id}"/><wps:cNvSpPr/><wps:spPr>${transform(box, scale)}${geometryXml(item.path, box, scale, Boolean(item.fill))}${fillXml(item.fill, opacity)}${strokeXml(item, opacity, scale)}${effect}</wps:spPr><wps:bodyPr/></wps:wsp>`;
  };
  /** Position a real Word text box at the captured baseline, retaining its anchor and font. */
  const text = (item: SceneText, opacity: number): string => {
    if (!item.text || item.color.a * opacity <= 0) return '';
    const id = options.nextId();
    const family = resolveFamily(item.font.family);
    options.families.set(family.name, family);
    const face = options.registry.resolve({ family, weight: item.font.weight, italic: item.font.italic }).fonts[0]?.font;
    const ascent = face ? face.ascent / face.unitsPerEm * item.font.size : item.font.size * 0.8;
    const descent = face ? Math.abs(face.descent) / face.unitsPerEm * item.font.size : item.font.size * 0.2;
    // A little horizontal slack avoids rounding/Office font metrics clipping a
    // line. Align around the same anchor so centered/right labels do not drift.
    const lineWidth = Math.max(item.width, item.font.size) + 4;
    const x = item.anchor === 'middle' ? item.x - lineWidth / 2 : item.anchor === 'end' ? item.x - lineWidth : item.x;
    const box = { x, y: item.y - ascent, width: lineWidth, height: ascent + descent };
    const font = escapeXmlAttr(family.name);
    const size = Math.max(2, halfPoints(item.font.size * scale));
    const bold = item.font.weight >= 600 ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
    const italic = item.font.italic ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>';
    const rtl = hasRtlText(item.text);
    const align = item.anchor === 'middle' ? 'center' : item.anchor === 'end' ? 'right' : 'left';
    const color = toHex({ ...item.color, a: item.color.a * opacity });
    const properties = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>${bold}${italic}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${rtl ? '<w:rtl/>' : ''}</w:rPr>`;
    return `<wps:wsp><wps:cNvPr id="${id}" name="Graphic text ${id}"/><wps:cNvSpPr txBox="1"/><wps:spPr>${transform(box, scale)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr><wps:txbx><w:txbxContent><w:p><w:pPr>${rtl ? '<w:bidi/>' : ''}<w:spacing w:before="0" w:after="0" w:line="${Math.max(1, twips(box.height * scale))}" w:lineRule="exact"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="${align}"/></w:pPr><w:r>${properties}<w:t xml:space="preserve">${escapeXml(item.text)}</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr vertOverflow="overflow" horzOverflow="overflow" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></wps:bodyPr></wps:wsp>`;
  };
  /** Flatten scene groups in paint order, multiplying inherited opacity. */
  const render = (items: SceneItem[], opacity = 1): string => items.map((item) => {
    if (item.kind === 'group') {
      if (item.clip) options.warnings.add('unsupported-style-dropped', 'Smart Graphic clipping');
      return render(item.items, opacity * (item.opacity ?? 1));
    }
    return item.kind === 'text' ? text(item, opacity) : visual(item, opacity);
  }).join('');
  const cx = emu(width);
  const cy = emu(scene.height * scale);
  return `<a:graphic><a:graphicData uri="${WORD_GROUP_NS}"><wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/><a:chOff x="0" y="0"/><a:chExt cx="${cx}" cy="${cy}"/></a:xfrm></wpg:grpSpPr>${render(scene.items)}</wpg:wgp></a:graphicData></a:graphic>`;
}
