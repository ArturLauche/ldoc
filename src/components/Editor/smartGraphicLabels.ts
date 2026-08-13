import type { SmartGraphicCategory, SmartGraphicLayoutId } from '@/lib/smartGraphic';
import type { TranslationKey } from '@/lib/translations';

export const GRAPHIC_CATEGORY_KEYS: Record<SmartGraphicCategory, TranslationKey> = {
  list: 'graphicCategoryList',
  process: 'graphicCategoryProcess',
  cycle: 'graphicCategoryCycle',
  hierarchy: 'graphicCategoryHierarchy',
  relationship: 'graphicCategoryRelationship',
  matrix: 'graphicCategoryMatrix',
  pyramid: 'graphicCategoryPyramid',
};

export const GRAPHIC_LAYOUT_KEYS: Record<SmartGraphicLayoutId, TranslationKey> = {
  'list-block': 'graphicLayoutListBlock',
  'list-horizontal': 'graphicLayoutListHorizontal',
  'process-chevron': 'graphicLayoutProcessChevron',
  'process-steps': 'graphicLayoutProcessSteps',
  'cycle-basic': 'graphicLayoutCycleBasic',
  'hierarchy-org': 'graphicLayoutHierarchyOrg',
  'relationship-opposing': 'graphicLayoutRelationshipOpposing',
  'relationship-radial': 'graphicLayoutRelationshipRadial',
  'matrix-grid': 'graphicLayoutMatrixGrid',
  'pyramid-basic': 'graphicLayoutPyramidBasic',
};
