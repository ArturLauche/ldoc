import type { Locale } from '@/lib/translations';
import { serializeSmartGraphic } from '@/lib/smartGraphic';
import { walkBlocks } from '../shared';
import type { ExportDocumentModel, ExportGraphicBlock } from '../types';
import { DOCUMENT_STYLE } from '../typography';
import { GRAPHIC_CAPTURE_MIN_WIDTH, canCaptureGraphics, captureGraphicScene } from './capture';

/**
 * Captures every Smart Graphic of a document once (identical graphics share a
 * capture). `columnWidth` is the text column the graphic sits in; the canvas
 * is laid out at least wide enough for each layout's desktop arrangement and
 * exporters scale it into the column.
 */
export async function prepareGraphicScenes(documentModel: ExportDocumentModel, columnWidth: number, locale: Locale): Promise<void> {
  const graphics: ExportGraphicBlock[] = [];
  walkBlocks(documentModel.blocks, (block) => {
    if (block.type === 'graphic' && block.model) graphics.push(block);
  });
  if (!graphics.length || !canCaptureGraphics()) return;
  const chrome = (DOCUMENT_STYLE.graphic.padding + DOCUMENT_STYLE.graphic.borderWidth) * 2;
  const width = Math.max(GRAPHIC_CAPTURE_MIN_WIDTH, Math.round(columnWidth - chrome));
  const captured = new Map<string, ExportGraphicBlock['scene'] | null>();
  for (const graphic of graphics) {
    const model = graphic.model;
    if (!model) continue;
    const key = serializeSmartGraphic(model);
    if (!captured.has(key)) {
      try {
        captured.set(key, await captureGraphicScene(model, width, locale));
      } catch {
        captured.set(key, null);
      }
    }
    const scene = captured.get(key);
    if (scene) graphic.scene = scene;
  }
}
