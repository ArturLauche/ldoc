import { t, type Locale, type TranslationKey } from '@/lib/translations';

export const SMART_GRAPHIC_VERSION = 1 as const;
export const MAX_GRAPHIC_JSON_LENGTH = 20_000;
export const MAX_GRAPHIC_LABEL_LENGTH = 200;
export const MAX_GRAPHIC_TITLE_LENGTH = 120;
export const MAX_GRAPHIC_NODES = 12;
export const MAX_GRAPHIC_LIST_DEPTH = 4;

export type SmartGraphicCategory =
  | 'list'
  | 'process'
  | 'timeline'
  | 'cycle'
  | 'hierarchy'
  | 'relationship'
  | 'matrix'
  | 'pyramid';

export type SmartGraphicStyle = 'filled' | 'outline' | 'subtle' | 'intense';

export type SmartGraphicColorSet = 'theme' | 'blue' | 'green' | 'orange' | 'purple' | 'gray';

/**
 * Stored layout ids. Ids are persisted in documents: never rename or remove
 * one; add new layouts at the end of their category instead.
 */
export type SmartGraphicLayoutId =
  | 'list-block'
  | 'list-horizontal'
  | 'list-numbered'
  | 'list-cards'
  | 'process-chevron'
  | 'process-steps'
  | 'process-arrow'
  | 'process-staircase'
  | 'timeline-horizontal'
  | 'timeline-vertical'
  | 'timeline-alternating'
  | 'cycle-basic'
  | 'cycle-segmented'
  | 'cycle-loop'
  | 'hierarchy-org'
  | 'hierarchy-horizontal'
  | 'hierarchy-tree'
  | 'relationship-opposing'
  | 'relationship-radial'
  | 'relationship-converging'
  | 'relationship-diverging'
  | 'relationship-venn'
  | 'relationship-nested'
  | 'matrix-grid'
  | 'matrix-swot'
  | 'matrix-titled'
  | 'pyramid-basic'
  | 'pyramid-inverted'
  | 'pyramid-list'
  | 'pyramid-funnel';

export type GraphicPlaceholderKind = 'item' | 'step' | 'topic' | 'level' | 'stage' | 'milestone';

/** One node of a layout's starter content: a localized placeholder or a fixed localized label. */
export interface GraphicStarterNode {
  kind?: GraphicPlaceholderKind;
  labelKey?: TranslationKey;
  children?: readonly GraphicStarterNode[];
}

export interface SmartGraphicItem {
  id: string;
  label: string;
  children: SmartGraphicItem[];
}

export interface SmartGraphicModel {
  version: 1;
  layoutId: SmartGraphicLayoutId;
  colorSet: SmartGraphicColorSet;
  style: SmartGraphicStyle;
  title: string;
  items: SmartGraphicItem[];
}

export interface SmartGraphicLayoutDefinition {
  id: SmartGraphicLayoutId;
  category: SmartGraphicCategory;
  /** Node bounds (all levels). Switching layouts keeps extra nodes; renderers show them as overflow. */
  minItems: number;
  maxItems: number;
  maxDepth: number;
  /** Number of nodes in the starter graphic. */
  starterCount: number;
  supportsHierarchy: boolean;
  placeholderKind: GraphicPlaceholderKind;
  /** Placeholder for nested nodes, when it differs from `placeholderKind`. */
  childPlaceholderKind?: GraphicPlaceholderKind;
  /** Order carries meaning (steps, stages, milestones): exports as a numbered list. */
  sequential: boolean;
  /** Starter tree for layouts whose structure matters; otherwise flat placeholders. */
  starter?: readonly GraphicStarterNode[];
}

export interface GraphicOutlineItem {
  label: string;
  children: GraphicOutlineItem[];
}

export const SMART_GRAPHIC_CATEGORIES: readonly SmartGraphicCategory[] = [
  'list',
  'process',
  'timeline',
  'cycle',
  'hierarchy',
  'relationship',
  'matrix',
  'pyramid',
];

export const SMART_GRAPHIC_STYLES: readonly SmartGraphicStyle[] = ['filled', 'outline', 'subtle', 'intense'];

export const SMART_GRAPHIC_COLOR_SETS: readonly SmartGraphicColorSet[] = [
  'theme',
  'blue',
  'green',
  'orange',
  'purple',
  'gray',
];

type LayoutSpec = Omit<
  SmartGraphicLayoutDefinition,
  'maxDepth' | 'starterCount' | 'supportsHierarchy' | 'sequential'
> & {
  maxDepth?: number;
  starterCount?: number;
  sequential?: boolean;
};

function defineLayout(spec: LayoutSpec): SmartGraphicLayoutDefinition {
  const maxDepth = spec.maxDepth ?? 1;
  return {
    ...spec,
    maxDepth,
    supportsHierarchy: maxDepth > 1,
    sequential: spec.sequential ?? false,
    starterCount: spec.starter ? countStarterNodes(spec.starter) : (spec.starterCount ?? 4),
  };
}

function countStarterNodes(nodes: readonly GraphicStarterNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countStarterNodes(node.children ?? []), 0);
}

/** One root with a small team below it; shared by the tree layouts. */
const ORG_STARTER: readonly GraphicStarterNode[] = [{ children: [{}, { children: [{}] }, {}] }];

const CARD_STARTER: readonly GraphicStarterNode[] = [
  { children: [{}, {}] },
  { children: [{}, {}] },
  { children: [{}, {}] },
];

const SWOT_STARTER: readonly GraphicStarterNode[] = [
  { labelKey: 'graphicStarterStrengths', children: [{}] },
  { labelKey: 'graphicStarterWeaknesses', children: [{}] },
  { labelKey: 'graphicStarterOpportunities', children: [{}] },
  { labelKey: 'graphicStarterThreats', children: [{}] },
];

/**
 * The layout library, in gallery order. Bounds are per layout: the global
 * `MAX_GRAPHIC_NODES` safety limit applies on top of every entry.
 */
export const SMART_GRAPHIC_LAYOUTS: readonly SmartGraphicLayoutDefinition[] = [
  defineLayout({ id: 'list-block', category: 'list', minItems: 2, maxItems: 8, placeholderKind: 'item' }),
  defineLayout({ id: 'list-horizontal', category: 'list', minItems: 2, maxItems: 6, placeholderKind: 'item' }),
  defineLayout({ id: 'list-numbered', category: 'list', minItems: 2, maxItems: 10, placeholderKind: 'item', sequential: true }),
  defineLayout({ id: 'list-cards', category: 'list', minItems: 2, maxItems: 12, maxDepth: 2, placeholderKind: 'topic', childPlaceholderKind: 'item', starter: CARD_STARTER }),
  defineLayout({ id: 'process-chevron', category: 'process', minItems: 2, maxItems: 6, placeholderKind: 'step', sequential: true }),
  defineLayout({ id: 'process-steps', category: 'process', minItems: 2, maxItems: 8, placeholderKind: 'step', sequential: true }),
  defineLayout({ id: 'process-arrow', category: 'process', minItems: 2, maxItems: 6, placeholderKind: 'step', sequential: true }),
  defineLayout({ id: 'process-staircase', category: 'process', minItems: 2, maxItems: 6, placeholderKind: 'stage', sequential: true }),
  defineLayout({ id: 'timeline-horizontal', category: 'timeline', minItems: 2, maxItems: 8, placeholderKind: 'milestone', sequential: true }),
  defineLayout({ id: 'timeline-vertical', category: 'timeline', minItems: 2, maxItems: 12, maxDepth: 2, placeholderKind: 'milestone', childPlaceholderKind: 'item', sequential: true }),
  defineLayout({ id: 'timeline-alternating', category: 'timeline', minItems: 2, maxItems: 12, maxDepth: 2, placeholderKind: 'milestone', childPlaceholderKind: 'item', sequential: true }),
  defineLayout({ id: 'cycle-basic', category: 'cycle', minItems: 3, maxItems: 8, starterCount: 5, placeholderKind: 'step', sequential: true }),
  defineLayout({ id: 'cycle-segmented', category: 'cycle', minItems: 3, maxItems: 8, placeholderKind: 'step', sequential: true }),
  defineLayout({ id: 'cycle-loop', category: 'cycle', minItems: 2, maxItems: 6, placeholderKind: 'step', sequential: true }),
  defineLayout({ id: 'hierarchy-org', category: 'hierarchy', minItems: 1, maxItems: 12, maxDepth: 3, placeholderKind: 'topic', starter: ORG_STARTER }),
  defineLayout({ id: 'hierarchy-horizontal', category: 'hierarchy', minItems: 1, maxItems: 12, maxDepth: 3, placeholderKind: 'topic', starter: ORG_STARTER }),
  defineLayout({ id: 'hierarchy-tree', category: 'hierarchy', minItems: 1, maxItems: 12, maxDepth: 4, placeholderKind: 'topic', starter: [{ children: [{ children: [{}, {}] }, { children: [{}] }] }] }),
  defineLayout({ id: 'relationship-opposing', category: 'relationship', minItems: 2, maxItems: 6, placeholderKind: 'item' }),
  defineLayout({ id: 'relationship-radial', category: 'relationship', minItems: 3, maxItems: 8, starterCount: 5, placeholderKind: 'topic' }),
  defineLayout({ id: 'relationship-converging', category: 'relationship', minItems: 3, maxItems: 7, placeholderKind: 'item' }),
  defineLayout({ id: 'relationship-diverging', category: 'relationship', minItems: 3, maxItems: 7, placeholderKind: 'item' }),
  defineLayout({ id: 'relationship-venn', category: 'relationship', minItems: 2, maxItems: 4, starterCount: 3, placeholderKind: 'item' }),
  defineLayout({ id: 'relationship-nested', category: 'relationship', minItems: 2, maxItems: 5, starterCount: 3, placeholderKind: 'level' }),
  defineLayout({ id: 'matrix-grid', category: 'matrix', minItems: 4, maxItems: 4, placeholderKind: 'item' }),
  defineLayout({ id: 'matrix-swot', category: 'matrix', minItems: 4, maxItems: 12, maxDepth: 2, placeholderKind: 'topic', childPlaceholderKind: 'item', starter: SWOT_STARTER }),
  defineLayout({ id: 'matrix-titled', category: 'matrix', minItems: 5, maxItems: 5, starterCount: 5, placeholderKind: 'topic' }),
  defineLayout({ id: 'pyramid-basic', category: 'pyramid', minItems: 2, maxItems: 5, starterCount: 3, placeholderKind: 'level' }),
  defineLayout({ id: 'pyramid-inverted', category: 'pyramid', minItems: 2, maxItems: 5, starterCount: 3, placeholderKind: 'level' }),
  defineLayout({ id: 'pyramid-list', category: 'pyramid', minItems: 2, maxItems: 6, placeholderKind: 'level' }),
  defineLayout({ id: 'pyramid-funnel', category: 'pyramid', minItems: 2, maxItems: 6, placeholderKind: 'stage', sequential: true }),
];

export const SMART_GRAPHIC_LAYOUT_IDS: readonly SmartGraphicLayoutId[] = SMART_GRAPHIC_LAYOUTS.map(
  (layout) => layout.id,
);

const LAYOUT_BY_ID = new Map(SMART_GRAPHIC_LAYOUTS.map((layout) => [layout.id, layout]));

export function isSmartGraphicLayoutId(value: unknown): value is SmartGraphicLayoutId {
  return typeof value === 'string' && LAYOUT_BY_ID.has(value as SmartGraphicLayoutId);
}

export function getSmartGraphicLayout(layoutId: string): SmartGraphicLayoutDefinition {
  return LAYOUT_BY_ID.get(layoutId as SmartGraphicLayoutId) ?? SMART_GRAPHIC_LAYOUTS[0];
}

export function layoutsForCategory(category: SmartGraphicCategory): SmartGraphicLayoutDefinition[] {
  return SMART_GRAPHIC_LAYOUTS.filter((layout) => layout.category === category);
}

/** True when item order carries meaning (exports use a numbered list). */
export function isSequentialGraphicLayout(layoutId: string): boolean {
  return LAYOUT_BY_ID.get(layoutId as SmartGraphicLayoutId)?.sequential ?? false;
}

export const GRAPHIC_PLACEHOLDER_KEYS: Record<GraphicPlaceholderKind, TranslationKey> = {
  item: 'graphicItemPlaceholder',
  step: 'graphicPlaceholderStep',
  topic: 'graphicPlaceholderTopic',
  level: 'graphicPlaceholderLevel',
  stage: 'graphicPlaceholderStage',
  milestone: 'graphicPlaceholderMilestone',
};

export function placeholderLabel(
  kind: GraphicPlaceholderKind,
  index: number,
  locale: Locale = 'en',
): string {
  return `${t(locale, GRAPHIC_PLACEHOLDER_KEYS[kind])} ${index + 1}`;
}

/** The placeholder kind for a node at `depth` (1 = top level) in this layout. */
export function placeholderKindAt(layout: SmartGraphicLayoutDefinition, depth: number): GraphicPlaceholderKind {
  return depth > 1 ? (layout.childPlaceholderKind ?? layout.placeholderKind) : layout.placeholderKind;
}

export function createGraphicId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36).slice(-6);
  return `g${stamp}${random}`.slice(0, 24);
}

export function createGraphicItem(label = '', children: SmartGraphicItem[] = []): SmartGraphicItem {
  return {
    id: createGraphicId(),
    label: sanitizeGraphicText(label, MAX_GRAPHIC_LABEL_LENGTH),
    children,
  };
}

export function createStarterGraphic(layoutId: SmartGraphicLayoutId = 'list-block', locale: Locale = 'en'): SmartGraphicModel {
  const layout = getSmartGraphicLayout(layoutId);
  const starter: readonly GraphicStarterNode[] =
    layout.starter ?? Array.from({ length: layout.starterCount }, () => ({}));
  // Placeholders count per kind in reading order: "Topic 1", "Text 1", "Text 2", "Topic 2"…
  const counters = new Map<GraphicPlaceholderKind, number>();
  const build = (nodes: readonly GraphicStarterNode[], depth: number): SmartGraphicItem[] =>
    nodes.map((node) => {
      let label: string;
      if (node.labelKey) {
        label = t(locale, node.labelKey);
      } else {
        const kind = node.kind ?? placeholderKindAt(layout, depth);
        const index = counters.get(kind) ?? 0;
        counters.set(kind, index + 1);
        label = placeholderLabel(kind, index, locale);
      }
      return createGraphicItem(label, build(node.children ?? [], depth + 1));
    });

  return clampGraphic({
    version: 1,
    layoutId: layout.id,
    colorSet: 'theme',
    style: 'filled',
    title: '',
    items: build(starter, 1),
  }, { trim: true }, locale);
}

export function coerceGraphic(value: unknown): SmartGraphicModel {
  return parseSmartGraphicJson(value, { trim: false }) ?? createStarterGraphic('list-block');
}

export function serializeSmartGraphic(model: SmartGraphicModel): string {
  const normalized = clampGraphic(model, { trim: false });
  return JSON.stringify({
    version: SMART_GRAPHIC_VERSION,
    layoutId: normalized.layoutId,
    colorSet: normalized.colorSet,
    style: normalized.style,
    title: normalized.title,
    items: normalized.items,
  });
}

export function parseSmartGraphicJson(value: unknown, options = { trim: true }): SmartGraphicModel | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (!value || value.length > MAX_GRAPHIC_JSON_LENGTH) return null;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed) || parsed.version !== SMART_GRAPHIC_VERSION) {
    return null;
  }

  const layoutId = isSmartGraphicLayoutId(parsed.layoutId) ? parsed.layoutId : null;
  if (!layoutId) return null;

  const layout = getSmartGraphicLayout(layoutId);
  const budget = { left: MAX_GRAPHIC_NODES };
  // Hierarchies accept any outline depth here; `clampGraphic` lifts nodes
  // beyond the layout's depth instead of dropping their text.
  const maxDepth = layout.supportsHierarchy ? MAX_GRAPHIC_LIST_DEPTH : 1;
  const items = parseItems(parsed.items, 1, maxDepth, budget, new Set(), options);
  if (!items.length) return null;

  return clampGraphic({
    version: 1,
    layoutId,
    colorSet: isColorSet(parsed.colorSet) ? parsed.colorSet : 'theme',
    style: isStyle(parsed.style) ? parsed.style : 'filled',
    title: sanitizeGraphicText(parsed.title, MAX_GRAPHIC_TITLE_LENGTH, options),
    items,
  }, options);
}

export function parseSmartGraphicFromDom(element: HTMLElement): SmartGraphicModel | null {
  const titleSource =
    (element.querySelector(':scope > p.lwrite-graphic-title') ?? element.querySelector(':scope > p'))
      ?.textContent ?? '';
  const list = element.querySelector(':scope > ul');
  const items = list ? parseListElement(list) : [];
  if (!items.length) {
    const fallback = sanitizeGraphicText(element.textContent ?? '', MAX_GRAPHIC_LABEL_LENGTH);
    if (!fallback) return null;
    return clampGraphic({
      ...createStarterGraphic('list-block'),
      items: [createGraphicItem(fallback)],
    });
  }

  return clampGraphic({
    version: 1,
    layoutId: items.some((item) => item.children.length > 0) ? 'hierarchy-org' : 'list-block',
    colorSet: 'theme',
    style: 'filled',
    title: sanitizeGraphicText(titleSource, MAX_GRAPHIC_TITLE_LENGTH),
    items,
  });
}

export function countGraphicNodes(items: SmartGraphicItem[]): number {
  return items.reduce((total, item) => total + 1 + countGraphicNodes(item.children), 0);
}

export function flattenGraphicItems(items: SmartGraphicItem[]): SmartGraphicItem[] {
  return items.flatMap((item) => [{ ...item, children: [] }, ...flattenGraphicItems(item.children)]);
}

export function flattenGraphicLabels(model: SmartGraphicModel): string[] {
  return flattenGraphicItems(model.items).map((item) => item.label);
}

export function switchGraphicLayout(model: SmartGraphicModel, layoutId: SmartGraphicLayoutId, locale: Locale = 'en'): SmartGraphicModel {
  const current = clampGraphic(model, { trim: false }, locale);
  return clampGraphic({
    ...current,
    layoutId,
  }, { trim: false }, locale);
}

export function updateGraphicTitle(model: SmartGraphicModel, title: string): SmartGraphicModel {
  return {
    ...clampGraphic(model),
    title: sanitizeGraphicText(title, MAX_GRAPHIC_TITLE_LENGTH, { trim: false }),
  };
}

export function updateGraphicAppearance(
  model: SmartGraphicModel,
  patch: Partial<Pick<SmartGraphicModel, 'colorSet' | 'style' | 'layoutId'>>,
): SmartGraphicModel {
  return clampGraphic({
    ...model,
    ...patch,
  }, { trim: false });
}

export function updateItemLabel(model: SmartGraphicModel, id: string, label: string): SmartGraphicModel {
  const nextLabel = sanitizeGraphicText(label, MAX_GRAPHIC_LABEL_LENGTH, { trim: false });
  const normalized = clampGraphic(model);
  return {
    ...normalized,
    items: mapItems(normalized.items, (item) => (item.id === id ? { ...item, label: nextLabel } : item)),
  };
}

export function addGraphicItem(model: SmartGraphicModel, afterId?: string | null, locale: Locale = 'en'): SmartGraphicModel {
  return insertGraphicItem(model, afterId, locale).model;
}

/** Adds a sibling after `afterId` (or at the end) and reports the new node's id. */
export function insertGraphicItem(
  model: SmartGraphicModel,
  afterId?: string | null,
  locale: Locale = 'en',
): { model: SmartGraphicModel; itemId: string | null } {
  const layout = getSmartGraphicLayout(model.layoutId);
  if (countGraphicNodes(model.items) >= layout.maxItems) {
    return { model, itemId: null };
  }

  const depth = afterId ? (findGraphicItemDepth(model.items, afterId) ?? 1) : 1;
  const item = createGraphicItem(nextPlaceholderLabel(model, layout, depth, locale));

  const nextItems = afterId
    ? mapSiblings(model.items, afterId, (siblings, index) => {
        const next = siblings.slice();
        next.splice(index + 1, 0, item);
        return next;
      })
    : null;
  const next = clampGraphic({ ...model, items: nextItems ?? [...model.items, item] }, { trim: false });
  return { model: next, itemId: item.id };
}

/** Adds a last child below `parentId` in hierarchy layouts. */
export function insertGraphicChild(
  model: SmartGraphicModel,
  parentId: string,
  locale: Locale = 'en',
): { model: SmartGraphicModel; itemId: string | null } {
  if (!canAddGraphicChild(model, parentId)) {
    return { model, itemId: null };
  }
  const layout = getSmartGraphicLayout(model.layoutId);
  const depth = (findGraphicItemDepth(model.items, parentId) ?? 1) + 1;
  const item = createGraphicItem(nextPlaceholderLabel(model, layout, depth, locale));
  const next = clampGraphic({
    ...model,
    items: mapItems(model.items, (entry) =>
      entry.id === parentId ? { ...entry, children: [...entry.children, item] } : entry,
    ),
  }, { trim: false });
  return { model: next, itemId: item.id };
}

export function canAddGraphicChild(model: SmartGraphicModel, parentId: string | null): boolean {
  if (!parentId) return false;
  const layout = getSmartGraphicLayout(model.layoutId);
  if (!layout.supportsHierarchy || !canAddGraphicItem(model)) return false;
  const depth = findGraphicItemDepth(model.items, parentId);
  return depth !== null && depth < layout.maxDepth;
}

export function removeGraphicItem(model: SmartGraphicModel, id: string): SmartGraphicModel {
  if (!canRemoveGraphicItem(model, id)) {
    return model;
  }

  const nextItems = mapSiblings(model.items, id, (siblings, index) => {
    const removed = siblings[index];
    return [...siblings.slice(0, index), ...removed.children, ...siblings.slice(index + 1)];
  });
  if (!nextItems || nextItems.length === 0) {
    return model;
  }
  return clampGraphic({ ...model, items: nextItems });
}

export function moveGraphicItem(model: SmartGraphicModel, id: string, direction: 'up' | 'down'): SmartGraphicModel {
  if (!canMoveGraphicItem(model, id, direction)) return model;
  const nextItems = mapSiblings(model.items, id, (siblings, index) => {
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    const next = siblings.slice();
    const current = next[index];
    next[index] = next[swapWith];
    next[swapWith] = current;
    return next;
  });
  return nextItems ? { ...model, items: nextItems } : model;
}

export function demoteGraphicItem(model: SmartGraphicModel, id: string): SmartGraphicModel {
  if (!canDemoteGraphicItem(model, id)) return model;
  const layout = getSmartGraphicLayout(model.layoutId);
  const nextItems = demoteInTree(model.items, id, layout.maxDepth, 1);
  return nextItems ? clampGraphic({ ...model, items: nextItems }) : model;
}

export function promoteGraphicItem(model: SmartGraphicModel, id: string): SmartGraphicModel {
  const layout = getSmartGraphicLayout(model.layoutId);
  if (!layout.supportsHierarchy) return model;
  const nextItems = promoteInTree(model.items, id);
  return nextItems ? clampGraphic({ ...model, items: nextItems }) : model;
}

export function canAddGraphicItem(model: SmartGraphicModel): boolean {
  return countGraphicNodes(model.items) < getSmartGraphicLayout(model.layoutId).maxItems;
}

/**
 * Whether an item can go without dropping below the layout's minimum. With
 * an `id`, also checks the top level: removing a top-level item lifts its
 * children into its place, and the top level must keep `minItems` shapes.
 */
export function canRemoveGraphicItem(model: SmartGraphicModel, id?: string | null): boolean {
  const { minItems } = getSmartGraphicLayout(model.layoutId);
  if (countGraphicNodes(model.items) <= minItems) return false;
  const index = id ? model.items.findIndex((item) => item.id === id) : -1;
  if (index < 0) return true;
  return model.items.length - 1 + model.items[index].children.length >= minItems;
}

export function canDemoteGraphicItem(model: SmartGraphicModel, id: string | null): boolean {
  if (!id) return false;
  const layout = getSmartGraphicLayout(model.layoutId);
  if (!layout.supportsHierarchy) return false;
  // A top-level item may only move down while the top level keeps its minimum.
  if (model.items.length <= layout.minItems && model.items.some((item) => item.id === id)) return false;
  return findDemoteTarget(model.items, id, layout.maxDepth, 1) !== null;
}

export function canPromoteGraphicItem(model: SmartGraphicModel, id: string | null): boolean {
  if (!id || !getSmartGraphicLayout(model.layoutId).supportsHierarchy) return false;
  return (findGraphicItemDepth(model.items, id) ?? 1) > 1;
}

export function canMoveGraphicItem(
  model: SmartGraphicModel,
  id: string | null,
  direction: 'up' | 'down',
): boolean {
  if (!id) return false;
  const siblings = findSiblings(model.items, id);
  if (!siblings) return false;
  const index = siblings.findIndex((item) => item.id === id);
  return direction === 'up' ? index > 0 : index < siblings.length - 1;
}

/** The node to select after removing `id`: its first child, else a neighbor, else its parent. */
export function graphicSelectionAfterRemoval(model: SmartGraphicModel, id: string): string | null {
  const siblings = findSiblings(model.items, id);
  if (!siblings) return null;
  const index = siblings.findIndex((item) => item.id === id);
  const removed = siblings[index];
  if (removed.children.length) return removed.children[0].id;
  const neighbor = siblings[index - 1] ?? siblings[index + 1];
  if (neighbor) return neighbor.id;
  return findParentId(model.items, id);
}

/** Depth of a node (1 = top level), or null when it is not in the tree. */
export function findGraphicItemDepth(items: SmartGraphicItem[], id: string, depth = 1): number | null {
  for (const item of items) {
    if (item.id === id) return depth;
    const nested = findGraphicItemDepth(item.children, id, depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

export function graphicToOutline(model: SmartGraphicModel): { title: string; items: GraphicOutlineItem[] } {
  const normalized = clampGraphic(model);
  return {
    title: normalized.title,
    items: toOutlineItems(normalized.items),
  };
}

export function appendGraphicFallback(doc: Document, element: Element, model: SmartGraphicModel): void {
  const normalized = clampGraphic(model);
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  if (normalized.title) {
    const title = doc.createElement('p');
    title.className = 'lwrite-graphic-title';
    title.textContent = normalized.title;
    element.appendChild(title);
  }
  element.appendChild(createListElement(doc, normalized.items));
}

export function graphicFallbackDOMSpec(model: SmartGraphicModel): Array<[string, Record<string, string>, ...unknown[]]> {
  const normalized = clampGraphic(model);
  const nodes: Array<[string, Record<string, string>, ...unknown[]]> = [];
  if (normalized.title) {
    nodes.push(['p', { class: 'lwrite-graphic-title' }, normalized.title]);
  }
  nodes.push(listDOMSpec(normalized.items));
  return nodes;
}

export function sanitizeGraphicText(
  value: unknown,
  maxLength: number,
  options?: { trim?: boolean },
): string {
  if (typeof value !== 'string') return '';
  const collapsed = value.replace(/\s+/g, ' ');
  const prepared = options?.trim === false ? collapsed.replace(/^\s+/, '') : collapsed.trim();
  return prepared.slice(0, maxLength);
}

function clampGraphic(model: SmartGraphicModel, options = { trim: true }, locale: Locale = 'en'): SmartGraphicModel {
  const layout = getSmartGraphicLayout(model.layoutId);
  const sourceItems = layout.supportsHierarchy
    ? limitGraphicDepth(model.items, layout.maxDepth)
    : flattenGraphicItems(model.items);
  let items = capItems(sourceItems, layout, options);
  // Renderers draw one shape per top-level item (quadrants, cards,
  // milestones), so the minimum applies to the top level. Placeholders
  // fill it while the layout has room; past that, nested items move up
  // instead, so the node count never outgrows the layout or the parse cap.
  if (items.length < layout.minItems) {
    const count = items.length;
    const room = Math.max(0, Math.min(layout.maxItems, MAX_GRAPHIC_NODES) - countGraphicNodes(items));
    const extras = Array.from({ length: Math.min(layout.minItems - count, room) }, (_, index) =>
      createGraphicItem(placeholderLabel(layout.placeholderKind, count + index, locale)),
    );
    items = liftIntoTopLevel([...items, ...extras], layout.minItems);
  }
  return {
    version: 1,
    layoutId: layout.id,
    colorSet: isColorSet(model.colorSet) ? model.colorSet : 'theme',
    style: isStyle(model.style) ? model.style : 'filled',
    title: sanitizeGraphicText(model.title, MAX_GRAPHIC_TITLE_LENGTH, options),
    items,
  };
}

function capItems(items: SmartGraphicItem[], layout: SmartGraphicLayoutDefinition, options: { trim: boolean }): SmartGraphicItem[] {
  const budget = { left: MAX_GRAPHIC_NODES };
  return parseItems(items, 1, layout.maxDepth, budget, new Set(), options);
}

/**
 * Moves trailing nested items up until the top level has `minimum` entries.
 * Each lifted item follows its former parent, so reading order is unchanged.
 */
function liftIntoTopLevel(items: SmartGraphicItem[], minimum: number): SmartGraphicItem[] {
  const next = items.slice();
  while (next.length < minimum) {
    let parentIndex = next.length - 1;
    while (parentIndex >= 0 && next[parentIndex].children.length === 0) parentIndex -= 1;
    if (parentIndex < 0) break;
    const parent = next[parentIndex];
    const lifted = parent.children[parent.children.length - 1];
    next.splice(parentIndex, 1, { ...parent, children: parent.children.slice(0, -1) }, lifted);
  }
  return next;
}

/**
 * Fits a tree into `maxDepth` levels without losing text: descendants below
 * the deepest allowed level become following siblings at that level.
 */
function limitGraphicDepth(items: SmartGraphicItem[], maxDepth: number, depth = 1): SmartGraphicItem[] {
  if (depth >= maxDepth) {
    return items.flatMap((item) => [{ ...item, children: [] }, ...flattenGraphicItems(item.children)]);
  }
  return items.map((item) => ({ ...item, children: limitGraphicDepth(item.children, maxDepth, depth + 1) }));
}

function parseItems(
  value: unknown,
  depth: number,
  maxDepth: number,
  budget: { left: number },
  usedIds: Set<string>,
  options: { trim: boolean },
): SmartGraphicItem[] {
  if (!Array.isArray(value) || depth > maxDepth || budget.left <= 0) {
    return [];
  }

  const items: SmartGraphicItem[] = [];
  for (const entry of value) {
    if (budget.left <= 0) break;
    if (!isRecord(entry)) continue;
    budget.left -= 1;
    const children = depth < maxDepth ? parseItems(entry.children, depth + 1, maxDepth, budget, usedIds, options) : [];
    items.push({
      id: sanitizeGraphicId(entry.id, usedIds),
      label: sanitizeGraphicText(entry.label, MAX_GRAPHIC_LABEL_LENGTH, options),
      children,
    });
  }
  return items;
}

function parseListElement(
  list: Element,
  depth = 1,
  budget = { left: MAX_GRAPHIC_NODES },
): SmartGraphicItem[] {
  if (depth > MAX_GRAPHIC_LIST_DEPTH || budget.left <= 0) {
    return [];
  }

  const items: SmartGraphicItem[] = [];
  for (const child of Array.from(list.children)) {
    if (budget.left <= 0) break;
    if (child.tagName.toLowerCase() !== 'li') continue;
    const nested = Array.from(child.children).find((node) => node.tagName.toLowerCase() === 'ul');
    const labelSource = child.cloneNode(true) as HTMLElement;
    labelSource.querySelectorAll('ul').forEach((node) => node.remove());
    budget.left -= 1;
    const item = createGraphicItem(
      sanitizeGraphicText(labelSource.textContent ?? '', MAX_GRAPHIC_LABEL_LENGTH),
      nested ? parseListElement(nested, depth + 1, budget) : [],
    );
    if (item.label.length > 0 || item.children.length > 0) {
      items.push(item);
    } else {
      budget.left += 1;
    }
  }
  return items;
}

function createListElement(doc: Document, items: SmartGraphicItem[]): HTMLUListElement {
  const list = doc.createElement('ul');
  items.forEach((item) => {
    const li = doc.createElement('li');
    li.textContent = item.label;
    if (item.children.length) {
      li.appendChild(createListElement(doc, item.children));
    }
    list.appendChild(li);
  });
  return list;
}

function listDOMSpec(items: SmartGraphicItem[]): [string, Record<string, string>, ...unknown[]] {
  return [
    'ul',
    {},
    ...items.map((item) => {
      if (!item.children.length) {
        return ['li', {}, item.label] as [string, Record<string, string>, string];
      }
      return ['li', {}, item.label, listDOMSpec(item.children)] as [string, Record<string, string>, ...unknown[]];
    }),
  ];
}

function toOutlineItems(items: SmartGraphicItem[]): GraphicOutlineItem[] {
  return items.map((item) => ({
    label: item.label,
    children: toOutlineItems(item.children),
  }));
}

function mapItems(items: SmartGraphicItem[], mapper: (item: SmartGraphicItem) => SmartGraphicItem): SmartGraphicItem[] {
  return items.map((item) => {
    const mapped = mapper(item);
    return { ...mapped, children: mapItems(mapped.children, mapper) };
  });
}

function mapSiblings(
  items: SmartGraphicItem[],
  id: string,
  mapper: (siblings: SmartGraphicItem[], index: number) => SmartGraphicItem[],
): SmartGraphicItem[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    return mapper(items, index);
  }
  for (let i = 0; i < items.length; i += 1) {
    const nested = mapSiblings(items[i].children, id, mapper);
    if (nested) {
      const next = items.slice();
      next[i] = { ...items[i], children: nested };
      return next;
    }
  }
  return null;
}

/**
 * Placeholder for a new node. Single-kind layouts number by node count; layouts
 * with a separate child kind number headings and details independently.
 */
function nextPlaceholderLabel(
  model: SmartGraphicModel,
  layout: SmartGraphicLayoutDefinition,
  depth: number,
  locale: Locale,
): string {
  const kind = placeholderKindAt(layout, depth);
  if (!layout.childPlaceholderKind) {
    return placeholderLabel(kind, countGraphicNodes(model.items), locale);
  }
  const index =
    depth > 1
      ? countGraphicNodes(model.items) - model.items.length
      : model.items.length;
  return placeholderLabel(kind, index, locale);
}

function findSiblings(items: SmartGraphicItem[], id: string): SmartGraphicItem[] | null {
  if (items.some((item) => item.id === id)) return items;
  for (const item of items) {
    const nested = findSiblings(item.children, id);
    if (nested) return nested;
  }
  return null;
}

function findParentId(items: SmartGraphicItem[], id: string, parentId: string | null = null): string | null {
  for (const item of items) {
    if (item.id === id) return parentId;
    const nested = findParentId(item.children, id, item.id);
    if (nested) return nested;
  }
  return null;
}

function itemSubtreeDepth(item: SmartGraphicItem): number {
  if (!item.children.length) return 1;
  return 1 + Math.max(...item.children.map(itemSubtreeDepth));
}

function findDemoteTarget(
  items: SmartGraphicItem[],
  id: string,
  maxDepth: number,
  depth: number,
): { index: number; items: SmartGraphicItem[] } | null {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    if (index === 0) return null;
    const moving = items[index];
    if (depth + itemSubtreeDepth(moving) > maxDepth) return null;
    return { index, items };
  }
  for (const item of items) {
    const nested = findDemoteTarget(item.children, id, maxDepth, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function demoteInTree(
  items: SmartGraphicItem[],
  id: string,
  maxDepth: number,
  depth: number,
): SmartGraphicItem[] | null {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    if (index === 0 || depth + itemSubtreeDepth(items[index]) > maxDepth) return items;
    const previous = items[index - 1];
    const moving = items[index];
    const nextPrevious = { ...previous, children: [...previous.children, moving] };
    return [...items.slice(0, index - 1), nextPrevious, ...items.slice(index + 1)];
  }
  for (let i = 0; i < items.length; i += 1) {
    const nested = demoteInTree(items[i].children, id, maxDepth, depth + 1);
    if (nested) {
      const next = items.slice();
      next[i] = { ...items[i], children: nested };
      return next;
    }
  }
  return null;
}

function promoteInTree(items: SmartGraphicItem[], id: string): SmartGraphicItem[] | null {
  for (let i = 0; i < items.length; i += 1) {
    const childIndex = items[i].children.findIndex((child) => child.id === id);
    if (childIndex >= 0) {
      const parent = items[i];
      const child = parent.children[childIndex];
      const nextParent: SmartGraphicItem = {
        ...parent,
        children: parent.children.filter((_, index) => index !== childIndex),
      };
      const next = items.slice();
      next[i] = nextParent;
      next.splice(i + 1, 0, child);
      return next;
    }
    const nested = promoteInTree(items[i].children, id);
    if (nested) {
      const next = items.slice();
      next[i] = { ...items[i], children: nested };
      return next;
    }
  }
  return null;
}

function sanitizeGraphicId(value: unknown, usedIds: Set<string>): string {
  let candidate =
    typeof value === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(value) ? value : createGraphicId();
  while (usedIds.has(candidate)) {
    candidate = createGraphicId();
  }
  usedIds.add(candidate);
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColorSet(value: unknown): value is SmartGraphicColorSet {
  return typeof value === 'string' && (SMART_GRAPHIC_COLOR_SETS as readonly string[]).includes(value);
}

function isStyle(value: unknown): value is SmartGraphicStyle {
  return typeof value === 'string' && (SMART_GRAPHIC_STYLES as readonly string[]).includes(value);
}

