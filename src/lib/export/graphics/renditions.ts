import type { ExportFontRegistry } from '../fonts/registry';
import { mapWithConcurrency } from '../resources';
import { walkBlocks } from '../shared';
import { DOCUMENT_STYLE } from '../typography';
import type { ExportDocumentModel, ExportGraphicBlock, PreparedExportImage } from '../types';
import type { WarningCollector } from '../warnings';
import { parseCssColor } from '../color';
import { noteSceneFonts, outlineSceneText } from './fonts';
import { roundedRectPath, transformPath, type GraphicScene, type SceneItem } from './scene';
import { sceneToSvg } from './svg';

/** Pixel density of graphic bitmaps for office formats (≈190 dpi in a printed text column). */
const RASTER_SCALE = 2;
const MAX_RASTER_PIXELS = 12_000_000;

function translateItems(items: SceneItem[], dx: number, dy: number): SceneItem[] {
  const matrix: [number, number, number, number, number, number] = [1, 0, 0, 1, dx, dy];
  return items.map((item): SceneItem => {
    if (item.kind === 'text') return { ...item, x: item.x + dx, y: item.y + dy };
    if (item.kind === 'group') {
      return { ...item, ...(item.clip ? { clip: transformPath(item.clip, matrix) } : {}), items: translateItems(item.items, dx, dy) };
    }
    const fill = item.fill && 'kind' in item.fill
      ? { ...item.fill, x1: item.fill.x1 + dx, y1: item.fill.y1 + dy, x2: item.fill.x2 + dx, y2: item.fill.y2 + dy }
      : item.fill;
    return { ...item, path: transformPath(item.path, matrix), ...(fill ? { fill } : {}) };
  });
}

/** The editor's graphic frame (white card, border, 12px radius, 20px padding) around a scene. */
export function frameScene(scene: GraphicScene): GraphicScene {
  const frame = DOCUMENT_STYLE.graphic;
  const inset = frame.padding + frame.borderWidth;
  const width = scene.width + inset * 2;
  const height = scene.height + inset * 2;
  const r: [number, number] = [frame.radius, frame.radius];
  const half = frame.borderWidth / 2;
  const border = parseCssColor(`#${frame.borderColor}`) ?? { r: 219, g: 224, b: 230, a: 1 };
  return {
    width,
    height,
    items: [
      {
        kind: 'shape',
        path: roundedRectPath(half, half, width - frame.borderWidth, height - frame.borderWidth, { tl: r, tr: r, br: r, bl: r }),
        fill: { r: 255, g: 255, b: 255, a: 1 },
        stroke: { color: border, width: frame.borderWidth },
      },
      ...translateItems(scene.items, inset, inset),
    ],
  };
}

/** Rasterizes an SVG with the browser; null outside a browser. */
export async function rasterizeSvg(svg: string, width: number, height: number, scale = RASTER_SCALE): Promise<PreparedExportImage | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || /jsdom/i.test(navigator.userAgent)) return null;
  const factor = Math.min(scale, Math.sqrt(MAX_RASTER_PIXELS / Math.max(1, width * height)));
  const pixelWidth = Math.max(1, Math.round(width * factor));
  const pixelHeight = Math.max(1, Math.round(height * factor));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG decode failed'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: 'image/png',
      extension: 'png',
      width: pixelWidth,
      height: pixelHeight,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Notes the fonts every captured graphic needs (call before `registry.load`). */
export function noteGraphicFonts(registry: ExportFontRegistry, documentModel: ExportDocumentModel): void {
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'graphic' && block.scene) noteSceneFonts(registry, block.scene);
  });
}

/**
 * Office formats get each graphic as a framed SVG with outlined text (exact
 * without the fonts installed) and a PNG of the same drawing. Identical
 * graphics share one rendition.
 */
export async function prepareGraphicRenditions(
  documentModel: ExportDocumentModel,
  registry: ExportFontRegistry,
  warnings: WarningCollector,
): Promise<void> {
  const graphics: ExportGraphicBlock[] = [];
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'graphic' && block.scene) graphics.push(block);
  });
  // Identical graphics share one capture, so one rendition per scene; bitmaps decode in parallel.
  const scenes = Array.from(new Set(graphics.map((graphic) => graphic.scene as GraphicScene)));
  const renditions = new Map<GraphicScene, { svg: Uint8Array; raster: PreparedExportImage | null }>();
  await mapWithConcurrency(scenes, 3, async (scene) => {
    const framed = frameScene(scene);
    const svg = sceneToSvg(framed, {
      outline: (text) => outlineSceneText(registry, text),
      fontStack: (family) => `'${family}', sans-serif`,
    });
    renditions.set(scene, { svg: new TextEncoder().encode(svg), raster: await rasterizeSvg(svg, framed.width, framed.height) });
  });
  graphics.forEach((graphic) => {
    const rendition = renditions.get(graphic.scene as GraphicScene);
    if (rendition?.raster) {
      graphic.svg = rendition.svg;
      graphic.raster = rendition.raster;
    } else {
      // Without a bitmap the office formats fall back to the outline.
      delete graphic.scene;
    }
  });
  if (graphics.some((graphic) => graphic.raster)) warnings.add('graphic-rendered-as-image');
}
