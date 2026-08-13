export const SMART_GRAPHIC_VERSION = 1 as const;
export const MAX_GRAPHIC_JSON_LENGTH = 20_000;
export const MAX_GRAPHIC_LABEL_LENGTH = 200;
export const MAX_GRAPHIC_TITLE_LENGTH = 120;
export const MAX_GRAPHIC_NODES = 12;
export const MAX_GRAPHIC_LIST_DEPTH = 4;

export type SmartGraphicCategory =
  | 'list'
  | 'process'
  | 'cycle'
  | 'hierarchy'
  | 'relationship'
  | 'matrix'
  | 'pyramid';

export type SmartGraphicStyle = 'filled' | 'outline' | 'subtle' | 'intense';

export type SmartGraphicColorSet = 'theme' | 'blue' | 'green' | 'orange' | 'purple' | 'gray';

export type SmartGraphicLayoutId =
  | 'list-block'
  | 'list-horizontal'
  | 'process-chevron'
  | 'process-steps'
  | 'cycle-basic'
  | 'hierarchy-org'
  | 'relationship-opposing'
  | 'relationship-radial'
  | 'matrix-grid'
  | 'pyramid-basic';

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
  minItems: number;
  maxItems: number;
  maxDepth: number;
  starterCount: number;
  supportsHierarchy: boolean;
  placeholderKind: 'item' | 'step' | 'topic' | 'level';
}

export interface GraphicOutlineItem {
  label: string;
  children: GraphicOutlineItem[];
}

export const SMART_GRAPHIC_CATEGORIES: readonly SmartGraphicCategory[] = [
  'list',
  'process',
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

export const SMART_GRAPHIC_LAYOUTS: readonly SmartGraphicLayoutDefinition[] = [
  { id: 'list-block', category: 'list', minItems: 2, maxItems: 8, maxDepth: 1, starterCount: 4, supportsHierarchy: false, placeholderKind: 'item' },
  { id: 'list-horizontal', category: 'list', minItems: 2, maxItems: 6, maxDepth: 1, starterCount: 4, supportsHierarchy: false, placeholderKind: 'item' },
  { id: 'process-chevron', category: 'process', minItems: 2, maxItems: 6, maxDepth: 1, starterCount: 4, supportsHierarchy: false, placeholderKind: 'step' },
  { id: 'process-steps', category: 'process', minItems: 2, maxItems: 8, maxDepth: 1, starterCount: 4, supportsHierarchy: false, placeholderKind: 'step' },
  { id: 'cycle-basic', category: 'cycle', minItems: 3, maxItems: 8, maxDepth: 1, starterCount: 5, supportsHierarchy: false, placeholderKind: 'step' },
  { id: 'hierarchy-org', category: 'hierarchy', minItems: 1, maxItems: 12, maxDepth: 3, starterCount: 5, supportsHierarchy: true, placeholderKind: 'topic' },
  { id: 'relationship-opposing', category: 'relationship', minItems: 2, maxItems: 6, maxDepth: 1, starterCount: 4, supportsHierarchy: false, placeholderKind: 'item' },
  { id: 'relationship-radial', category: 'relationship', minItems: 3, maxItems: 8, maxDepth: 1, starterCount: 5, supportsHierarchy: false, placeholderKind: 'topic' },
  { id: 'matrix-grid', category: 'matrix', minItems: 4, maxItems: 4, maxDepth: 1, starterCount: 4, supportsHierarchy: false, placeholderKind: 'item' },
  { id: 'pyramid-basic', category: 'pyramid', minItems: 2, maxItems: 5, maxDepth: 1, starterCount: 3, supportsHierarchy: false, placeholderKind: 'level' },
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

export function placeholderLabel(kind: SmartGraphicLayoutDefinition['placeholderKind'], index: number): string {
  const n = index + 1;
  switch (kind) {
    case 'step':
      return `Step ${n}`;
    case 'topic':
      return `Topic ${n}`;
    case 'level':
      return `Level ${n}`;
    default:
      return `Text ${n}`;
  }
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

export function createStarterGraphic(layoutId: SmartGraphicLayoutId = 'list-block'): SmartGraphicModel {
  const layout = getSmartGraphicLayout(layoutId);
  if (layout.supportsHierarchy) {
    const root = createGraphicItem(placeholderLabel('topic', 0), [
      createGraphicItem(placeholderLabel('topic', 1)),
      createGraphicItem(placeholderLabel('topic', 2), [
        createGraphicItem(placeholderLabel('topic', 3)),
      ]),
    ]);
    const extra = createGraphicItem(placeholderLabel('topic', 4));
    return clampGraphic({
      version: 1,
      layoutId: layout.id,
      colorSet: 'theme',
      style: 'filled',
      title: '',
      items: [root, extra],
    });
  }

  const items = Array.from({ length: layout.starterCount }, (_, index) =>
    createGraphicItem(placeholderLabel(layout.placeholderKind, index)),
  );
  return {
    version: 1,
    layoutId: layout.id,
    colorSet: 'theme',
    style: 'filled',
    title: '',
    items,
  };
}

export function coerceGraphic(value: unknown): SmartGraphicModel {
  return parseSmartGraphicJson(value) ?? createStarterGraphic('list-block');
}

export function serializeSmartGraphic(model: SmartGraphicModel): string {
  const normalized = clampGraphic(model);
  return JSON.stringify({
    version: SMART_GRAPHIC_VERSION,
    layoutId: normalized.layoutId,
    colorSet: normalized.colorSet,
    style: normalized.style,
    title: normalized.title,
    items: normalized.items,
  });
}

export function parseSmartGraphicJson(value: unknown): SmartGraphicModel | null {
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
  const items = parseItems(parsed.items, 1, layout, budget, new Set());
  if (!items.length) return null;

  return clampGraphic({
    version: 1,
    layoutId,
    colorSet: isColorSet(parsed.colorSet) ? parsed.colorSet : 'theme',
    style: isStyle(parsed.style) ? parsed.style : 'filled',
    title: sanitizeGraphicText(parsed.title, MAX_GRAPHIC_TITLE_LENGTH),
    items,
  });
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

export function switchGraphicLayout(model: SmartGraphicModel, layoutId: SmartGraphicLayoutId): SmartGraphicModel {
  const current = clampGraphic(model);
  return clampGraphic({
    ...current,
    layoutId,
  });
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
  });
}

export function updateItemLabel(model: SmartGraphicModel, id: string, label: string): SmartGraphicModel {
  const nextLabel = sanitizeGraphicText(label, MAX_GRAPHIC_LABEL_LENGTH, { trim: false });
  const normalized = clampGraphic(model);
  return {
    ...normalized,
    items: mapItems(normalized.items, (item) => (item.id === id ? { ...item, label: nextLabel } : item)),
  };
}

export function addGraphicItem(model: SmartGraphicModel, afterId?: string | null): SmartGraphicModel {
  const layout = getSmartGraphicLayout(model.layoutId);
  if (countGraphicNodes(model.items) >= layout.maxItems) {
    return model;
  }

  const label = placeholderLabel(layout.placeholderKind, countGraphicNodes(model.items));
  const item = createGraphicItem(label);

  if (!afterId) {
    return clampGraphic({ ...model, items: [...model.items, item] });
  }

  const nextItems = mapSiblings(model.items, afterId, (siblings, index) => {
    const next = siblings.slice();
    next.splice(index + 1, 0, item);
    return next;
  });
  return clampGraphic({ ...model, items: nextItems ?? [...model.items, item] });
}

export function removeGraphicItem(model: SmartGraphicModel, id: string): SmartGraphicModel {
  if (countGraphicNodes(model.items) <= getSmartGraphicLayout(model.layoutId).minItems) {
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
  const nextItems = mapSiblings(model.items, id, (siblings, index) => {
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= siblings.length) return siblings;
    const next = siblings.slice();
    const current = next[index];
    next[index] = next[swapWith];
    next[swapWith] = current;
    return next;
  });
  return nextItems ? { ...model, items: nextItems } : model;
}

export function demoteGraphicItem(model: SmartGraphicModel, id: string): SmartGraphicModel {
  const layout = getSmartGraphicLayout(model.layoutId);
  if (!layout.supportsHierarchy) return model;
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

export function canRemoveGraphicItem(model: SmartGraphicModel): boolean {
  return countGraphicNodes(model.items) > getSmartGraphicLayout(model.layoutId).minItems;
}

export function canDemoteGraphicItem(model: SmartGraphicModel, id: string | null): boolean {
  if (!id) return false;
  const layout = getSmartGraphicLayout(model.layoutId);
  if (!layout.supportsHierarchy) return false;
  return findDemoteTarget(model.items, id, layout.maxDepth, 1) !== null;
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

function clampGraphic(model: SmartGraphicModel): SmartGraphicModel {
  const layout = getSmartGraphicLayout(model.layoutId);
  const sourceItems = layout.supportsHierarchy ? model.items : flattenGraphicItems(model.items);
  let items = capItems(sourceItems, layout);
  if (items.length < layout.minItems) {
    const extras = Array.from({ length: layout.minItems - items.length }, (_, index) =>
      createGraphicItem(placeholderLabel(layout.placeholderKind, items.length + index)),
    );
    items = [...items, ...extras];
  }
  return {
    version: 1,
    layoutId: layout.id,
    colorSet: isColorSet(model.colorSet) ? model.colorSet : 'theme',
    style: isStyle(model.style) ? model.style : 'filled',
    title: sanitizeGraphicText(model.title, MAX_GRAPHIC_TITLE_LENGTH),
    items,
  };
}

function capItems(items: SmartGraphicItem[], layout: SmartGraphicLayoutDefinition): SmartGraphicItem[] {
  const budget = { left: MAX_GRAPHIC_NODES };
  return parseItems(items, 1, layout, budget, new Set());
}

function parseItems(
  value: unknown,
  depth: number,
  layout: SmartGraphicLayoutDefinition,
  budget: { left: number },
  usedIds: Set<string>,
): SmartGraphicItem[] {
  if (!Array.isArray(value) || depth > layout.maxDepth || budget.left <= 0) {
    return [];
  }

  const items: SmartGraphicItem[] = [];
  for (const entry of value) {
    if (budget.left <= 0) break;
    if (!isRecord(entry)) continue;
    budget.left -= 1;
    const allowChildren = layout.supportsHierarchy && depth < layout.maxDepth;
    const children = allowChildren ? parseItems(entry.children, depth + 1, layout, budget, usedIds) : [];
    items.push({
      id: sanitizeGraphicId(entry.id, usedIds),
      label: sanitizeGraphicText(entry.label, MAX_GRAPHIC_LABEL_LENGTH),
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

