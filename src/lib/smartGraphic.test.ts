import { describe, expect, it } from 'vitest';
import { supportedLocales, t } from './translations';
import {
  addGraphicItem,
  canAddGraphicItem,
  canRemoveGraphicItem,
  coerceGraphic,
  createStarterGraphic,
  demoteGraphicItem,
  flattenGraphicLabels,
  moveGraphicItem,
  parseSmartGraphicFromDom,
  parseSmartGraphicJson,
  promoteGraphicItem,
  removeGraphicItem,
  serializeSmartGraphic,
  switchGraphicLayout,
  updateGraphicTitle,
  updateItemLabel,
  MAX_GRAPHIC_JSON_LENGTH,
  SMART_GRAPHIC_LAYOUTS,
  flattenGraphicItems,
  GRAPHIC_PLACEHOLDER_KEYS,
  MAX_GRAPHIC_LIST_DEPTH,
  MAX_GRAPHIC_NODES,
  SMART_GRAPHIC_CATEGORIES,
  canAddGraphicChild,
  canDemoteGraphicItem,
  canMoveGraphicItem,
  canPromoteGraphicItem,
  countGraphicNodes,
  findGraphicItemDepth,
  graphicSelectionAfterRemoval,
  insertGraphicChild,
  insertGraphicItem,
  isSequentialGraphicLayout,
  layoutsForCategory,
  type GraphicStarterNode,
  type SmartGraphicItem,
  type SmartGraphicModel,
} from './smartGraphic';
import type { TranslationKey } from './translations';

function starterLabelKeys(nodes: readonly GraphicStarterNode[] = []): TranslationKey[] {
  return nodes.flatMap((node) => [...(node.labelKey ? [node.labelKey] : []), ...starterLabelKeys(node.children)]);
}

describe('smartGraphic model', () => {
  it('creates a starter graphic for each layout with bounded nodes', () => {
    const process = createStarterGraphic('process-chevron');
    expect(process.layoutId).toBe('process-chevron');
    expect(process.items.length).toBeGreaterThanOrEqual(2);
    expect(flattenGraphicLabels(process).every((label) => label.length > 0)).toBe(true);

    const org = createStarterGraphic('hierarchy-org');
    expect(org.items.some((item) => item.children.length > 0)).toBe(true);
  });

  it('keeps user text when switching layouts', () => {
    const started = createStarterGraphic('process-steps');
    const labeled = updateItemLabel(started, started.items[0].id, 'Launch');
    const switched = switchGraphicLayout(labeled, 'list-block');
    expect(flattenGraphicLabels(switched)).toContain('Launch');
    expect(switched.layoutId).toBe('list-block');
  });

  it('keeps extra labels when switching to a layout with a smaller visual budget', () => {
    let model = createStarterGraphic('list-block');
    model = updateItemLabel(model, model.items[0].id, 'One');
    model = updateItemLabel(model, model.items[1].id, 'Two');
    model = updateItemLabel(model, model.items[2].id, 'Three');
    model = updateItemLabel(model, model.items[3].id, 'Four');
    while (canAddGraphicItem(model)) {
      model = addGraphicItem(model);
    }
    expect(model.items.length).toBe(8);
    const switched = switchGraphicLayout(model, 'pyramid-basic');
    expect(switched.layoutId).toBe('pyramid-basic');
    expect(flattenGraphicLabels(switched)).toEqual(expect.arrayContaining(['One', 'Two', 'Three', 'Four']));
    expect(flattenGraphicLabels(switched).length).toBe(8);
  });

  it('preserves trailing spaces while editing labels and titles', () => {
    const started = createStarterGraphic('list-block');
    const labeled = updateItemLabel(started, started.items[0].id, 'Hello ');
    expect(labeled.items[0].label).toBe('Hello ');
    const titled = updateGraphicTitle(started, 'Plan ');
    expect(titled.title).toBe('Plan ');
  });

  it('does not demote a node when its subtree would exceed max depth', () => {
    const org = createStarterGraphic('hierarchy-org');
    const nestedParent = org.items[0].children[1];
    const grandchild = nestedParent?.children[0];
    expect(nestedParent).toBeDefined();
    expect(grandchild).toBeDefined();
    if (!nestedParent || !grandchild) {
      throw new Error('expected nested hierarchy starter nodes');
    }

    const demoted = demoteGraphicItem(org, nestedParent.id);
    expect(demoted.items[0].children.map((item) => item.id)).toEqual(org.items[0].children.map((item) => item.id));
    expect(flattenGraphicLabels(demoted)).toContain(grandchild.label);
  });

  it('disables removal at the layout minimum and skips array item entries', () => {
    const matrix = createStarterGraphic('matrix-grid');
    expect(canRemoveGraphicItem(matrix)).toBe(false);
    expect(removeGraphicItem(matrix, matrix.items[0].id).items).toHaveLength(4);

    const parsed = parseSmartGraphicJson({
      version: 1,
      layoutId: 'list-block',
      colorSet: 'theme',
      style: 'filled',
      title: '',
      items: [
        ['not-an-item'],
        { id: 'dup', label: 'First', children: [] },
        { id: 'dup', label: 'Second', children: [] },
      ],
    });
    expect(parsed?.items).toHaveLength(2);
    expect(parsed?.items.map((item) => item.label)).toEqual(['First', 'Second']);
    expect(parsed?.items[0].id).not.toBe(parsed?.items[1].id);
  });

  it('adds, removes and reorders nodes without dropping remaining labels', () => {
    let model = createStarterGraphic('list-block');
    model = updateItemLabel(model, model.items[0].id, 'Alpha');
    model = updateItemLabel(model, model.items[1].id, 'Beta');
    model = addGraphicItem(model, model.items[0].id);
    expect(model.items[1].label).toMatch(/Text|Step|Topic|Level/);
    model = moveGraphicItem(model, model.items[0].id, 'down');
    expect(model.items[1].label).toBe('Alpha');
    const removed = removeGraphicItem(model, model.items[0].id);
    expect(flattenGraphicLabels(removed)).toContain('Alpha');
    expect(canRemoveGraphicItem(removed)).toBe(true);
  });

  it('promotes and demotes hierarchy items', () => {
    const org = createStarterGraphic('hierarchy-org');
    const child = org.items[0].children[0];
    expect(child).toBeDefined();
    const promoted = promoteGraphicItem(org, child.id);
    expect(promoted.items.some((item) => item.id === child.id)).toBe(true);
    const demoted = demoteGraphicItem(promoted, child.id);
    expect(demoted.items[0].children.some((item) => item.id === child.id)).toBe(true);
  });

  it('rejects malformed JSON, oversized payloads and unknown layouts', () => {
    expect(parseSmartGraphicJson('{not json')).toBeNull();
    expect(parseSmartGraphicJson({ version: 1, layoutId: 'nope', items: [] })).toBeNull();
    expect(parseSmartGraphicJson({ version: 2, layoutId: 'list-block', items: [{ id: 'a', label: 'A', children: [] }] })).toBeNull();

    const oversized = `{"version":1,"layoutId":"list-block","colorSet":"theme","style":"filled","title":"","items":${'['.repeat(MAX_GRAPHIC_JSON_LENGTH)}}`;
    expect(parseSmartGraphicJson(oversized)).toBeNull();
  });

  it('sanitizes labels and clamps node counts to the layout', () => {
    const parsed = parseSmartGraphicJson({
      version: 1,
      layoutId: 'matrix-grid',
      colorSet: 'blue',
      style: 'outline',
      title: '  Matrix   plan  ',
      items: Array.from({ length: 12 }, (_, index) => ({
        id: `item-${index}`,
        label: `<img src=x onerror=alert(1)> Q${index}`,
        children: [{ id: 'nested', label: 'should flatten', children: [] }],
      })),
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe('Matrix plan');
    expect(parsed?.items).toHaveLength(12);
    expect(parsed?.items.every((item) => item.children.length === 0)).toBe(true);
    expect(parsed?.items[0].label).toContain('Q0');
    expect(parsed?.items[0].label).toContain('<img');
  });

  it('rebuilds a model from nested list HTML and round-trips JSON', () => {
    const parsedDom = new DOMParser().parseFromString('<div></div>', 'text/html');
    const wrapper = parsedDom.createElement('div');
    const title = parsedDom.createElement('p');
    title.className = 'lwrite-graphic-title';
    title.textContent = 'Plan';
    const list = parsedDom.createElement('ul');
    const one = parsedDom.createElement('li');
    one.append('One');
    const nested = parsedDom.createElement('ul');
    const child = parsedDom.createElement('li');
    child.textContent = 'Child';
    nested.append(child);
    one.append(nested);
    const two = parsedDom.createElement('li');
    two.textContent = 'Two';
    list.append(one, two);
    wrapper.append(title, list);

    const fromDom = parseSmartGraphicFromDom(wrapper);
    expect(fromDom?.title).toBe('Plan');
    expect(fromDom?.items.map((item) => item.label)).toEqual(['One', 'Two']);
    expect(fromDom?.items[0].children[0].label).toBe('Child');

    const unordered = parsedDom.createElement('div');
    const leading = parsedDom.createElement('p');
    leading.textContent = 'Not the title';
    const classedTitle = parsedDom.createElement('p');
    classedTitle.className = 'lwrite-graphic-title';
    classedTitle.textContent = 'Real title';
    const simpleList = parsedDom.createElement('ul');
    const only = parsedDom.createElement('li');
    only.textContent = 'Only';
    simpleList.append(only);
    unordered.append(leading, classedTitle, simpleList);
    expect(parseSmartGraphicFromDom(unordered)?.title).toBe('Real title');

    const deep = parsedDom.createElement('div');
    const currentList = parsedDom.createElement('ul');
    deep.append(currentList);
    let currentItem = parsedDom.createElement('li');
    currentItem.append('L1');
    currentList.append(currentItem);
    for (let level = 2; level <= 8; level += 1) {
      const nestedList = parsedDom.createElement('ul');
      const nestedItem = parsedDom.createElement('li');
      nestedItem.append(`L${level}`);
      nestedList.append(nestedItem);
      currentItem.append(nestedList);
      currentItem = nestedItem;
    }
    const deepModel = parseSmartGraphicFromDom(deep);
    expect(deepModel).not.toBeNull();
    let depth = 0;
    let cursor = deepModel?.items[0];
    while (cursor) {
      depth += 1;
      cursor = cursor.children[0];
    }
    expect(depth).toBeLessThanOrEqual(4);

    const starter = updateGraphicTitle(createStarterGraphic('cycle-basic'), 'Cycle');
    const serialized = serializeSmartGraphic(starter);
    expect(serialized.length).toBeLessThan(MAX_GRAPHIC_JSON_LENGTH);
    expect(parseSmartGraphicJson(serialized)?.title).toBe('Cycle');
    expect(coerceGraphic(null).layoutId).toBe('list-block');
  });

  it('stops adding nodes once the layout bound is reached', () => {
    const model = createStarterGraphic('matrix-grid');
    expect(model.items).toHaveLength(4);
    expect(canAddGraphicItem(model)).toBe(false);
    const next = addGraphicItem(model, model.items[0].id);
    expect(next.items).toHaveLength(4);
  });

  it('keeps user spacing in stored labels and titles through serialization', () => {
    const model = createStarterGraphic('list-block');
    const labeled = updateItemLabel(model, model.items[0].id, 'Hello world ');
    expect(labeled.items[0].label).toBe('Hello world ');
    const serialized = serializeSmartGraphic(labeled);
    expect(serialized).toContain('Hello world ');
    expect(parseSmartGraphicJson(serialized, { trim: false })?.items[0].label).toBe('Hello world ');
  });

  it('localizes starter, add, clamp and switch fillers for every supported locale', () => {
    for (const locale of supportedLocales) {
      const placeholders = Object.values(GRAPHIC_PLACEHOLDER_KEYS).map((key) => t(locale, key));
      const fixedLabels = SMART_GRAPHIC_LAYOUTS.flatMap((layout) => starterLabelKeys(layout.starter)).map((key) =>
        t(locale, key),
      );
      for (const layout of SMART_GRAPHIC_LAYOUTS) {
        const starter = createStarterGraphic(layout.id, locale);
        const labels = flattenGraphicItems(starter.items).map((item) => item.label);
        expect(labels.length).toBe(layout.starterCount);
        expect(
          labels.every(
            (label) => fixedLabels.includes(label) || placeholders.some((word) => label.startsWith(`${word} `)),
          ),
        ).toBe(true);
        const switched = switchGraphicLayout(starter, 'list-block', locale);
        expect(flattenGraphicLabels(switched).every((label) => label.length > 0)).toBe(true);
        const withAdded = addGraphicItem(starter, starter.items[0].id, locale);
        if (canAddGraphicItem(starter)) {
          expect(flattenGraphicLabels(withAdded).some((label) => label.length > 0)).toBe(true);
        }
      }
    }
    expect(t('de', 'graphicPlaceholderStep')).toBe('Schritt');
    expect(t('de', 'graphicPlaceholderTopic')).toBe('Thema');
    expect(t('de', 'graphicPlaceholderLevel')).toBe('Ebene');
    expect(t('de', 'graphicPlaceholderStage')).toBe('Phase');
    expect(t('de', 'graphicPlaceholderMilestone')).toBe('Meilenstein');
    expect(t('en', 'graphicPlaceholderStep')).toBe('Step');
    expect(flattenGraphicLabels(createStarterGraphic('matrix-swot', 'de')).slice(0, 2)).toEqual(['Stärken', 'Text 1']);
  });

  it('trim-parses imported JSON but preserves spaces when normalizing live edits', () => {
    const model = createStarterGraphic('list-block');
    const labeled = updateItemLabel(model, model.items[0].id, 'A B ');
    const parsed = parseSmartGraphicJson(JSON.parse(JSON.stringify({ ...labeled })), { trim: false });
    expect(parsed?.items[0].label).toBe('A B ');
    const trimmedParse = parseSmartGraphicJson({ ...labeled });
    expect(trimmedParse?.items[0].label).toBe('A B');
  });

  it('keeps hierarchy children intact when switching and adding items', () => {
    const org = createStarterGraphic('hierarchy-org');
    const switched = switchGraphicLayout(org, 'list-horizontal');
    expect(flattenGraphicLabels(switched).length).toBe(flattenGraphicItems(org.items).length);
    const restored = switchGraphicLayout(switched, 'hierarchy-org');
    expect(restored.items[0].children.length).toBe(0);
  });
});

const LEGACY_LAYOUT_IDS = [
  'list-block',
  'list-horizontal',
  'process-chevron',
  'process-steps',
  'cycle-basic',
  'hierarchy-org',
  'relationship-opposing',
  'relationship-radial',
  'matrix-grid',
  'pyramid-basic',
] as const;

function treeDepth(items: SmartGraphicItem[]): number {
  return items.length ? 1 + Math.max(...items.map((item) => treeDepth(item.children))) : 0;
}

function sortedLabels(model: SmartGraphicModel): string[] {
  return flattenGraphicLabels(model).slice().sort();
}

describe('smartGraphic layout registry', () => {
  it('keeps every stored layout id and describes each layout consistently', () => {
    const ids = SMART_GRAPHIC_LAYOUTS.map((layout) => layout.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([...LEGACY_LAYOUT_IDS]));
    expect(ids.length).toBeGreaterThanOrEqual(30);

    for (const layout of SMART_GRAPHIC_LAYOUTS) {
      expect(SMART_GRAPHIC_CATEGORIES).toContain(layout.category);
      expect(layout.minItems).toBeGreaterThanOrEqual(1);
      expect(layout.minItems).toBeLessThanOrEqual(layout.starterCount);
      expect(layout.starterCount).toBeLessThanOrEqual(layout.maxItems);
      expect(layout.maxItems).toBeLessThanOrEqual(MAX_GRAPHIC_NODES);
      expect(layout.maxDepth).toBeLessThanOrEqual(MAX_GRAPHIC_LIST_DEPTH);
      expect(layout.supportsHierarchy).toBe(layout.maxDepth > 1);
      const starter = createStarterGraphic(layout.id);
      expect(countGraphicNodes(starter.items)).toBe(layout.starterCount);
      expect(treeDepth(starter.items)).toBeLessThanOrEqual(layout.maxDepth);
    }
    for (const category of SMART_GRAPHIC_CATEGORIES) {
      expect(layoutsForCategory(category).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('round-trips every starter through serialization', () => {
    for (const layout of SMART_GRAPHIC_LAYOUTS) {
      const starter = updateGraphicTitle(createStarterGraphic(layout.id, 'de'), 'Plan');
      const parsed = parseSmartGraphicJson(serializeSmartGraphic(starter));
      expect(parsed).toEqual(starter);
    }
  });

  it('loads documents saved with the original ten layouts unchanged', () => {
    for (const layoutId of LEGACY_LAYOUT_IDS) {
      const stored = JSON.stringify({
        version: 1,
        layoutId,
        colorSet: 'green',
        style: 'subtle',
        title: 'Saved',
        items: [
          { id: 'a1', label: 'One', children: layoutId === 'hierarchy-org' ? [{ id: 'a2', label: 'Two', children: [] }] : [] },
          { id: 'b1', label: 'Three', children: [] },
          { id: 'c1', label: 'Four', children: [] },
          { id: 'd1', label: 'Five', children: [] },
        ],
      });
      const parsed = parseSmartGraphicJson(stored);
      expect(parsed?.layoutId).toBe(layoutId);
      expect(parsed?.colorSet).toBe('green');
      expect(parsed?.style).toBe('subtle');
      expect(flattenGraphicLabels(parsed!)).toEqual(
        layoutId === 'hierarchy-org' ? ['One', 'Two', 'Three', 'Four', 'Five'] : ['One', 'Three', 'Four', 'Five'],
      );
      expect(parsed?.items[0].id).toBe('a1');
    }
  });

  it('keeps every label when switching between any two layouts', () => {
    for (const from of SMART_GRAPHIC_LAYOUTS) {
      const source = createStarterGraphic(from.id);
      for (const to of SMART_GRAPHIC_LAYOUTS) {
        const switched = switchGraphicLayout(source, to.id);
        expect(switched.layoutId).toBe(to.id);
        expect(sortedLabels(switched)).toEqual(
          expect.arrayContaining(sortedLabels(source)),
        );
        expect(treeDepth(switched.items)).toBeLessThanOrEqual(to.maxDepth);
      }
    }
  });

  it('lifts nodes beyond a hierarchy layout depth instead of dropping them', () => {
    const tree = createStarterGraphic('hierarchy-tree');
    expect(treeDepth(tree.items)).toBe(3);
    const deep = demoteGraphicItem(tree, tree.items[0].children[0].children[1].id);
    expect(treeDepth(deep.items)).toBe(4);

    const org = switchGraphicLayout(deep, 'hierarchy-org');
    expect(treeDepth(org.items)).toBe(3);
    expect(sortedLabels(org)).toEqual(sortedLabels(deep));

    const cards = switchGraphicLayout(deep, 'list-cards');
    expect(treeDepth(cards.items)).toBe(2);
    expect(cards.items[0].children.map((item) => item.label)).toEqual(['Topic 2', 'Topic 3', 'Topic 4', 'Topic 5', 'Topic 6']);

    const parsed = parseSmartGraphicJson({ ...deep, layoutId: 'hierarchy-org' });
    expect(sortedLabels(parsed!)).toEqual(sortedLabels(deep));
  });

  it('keeps the minimum number of top-level shapes when nodes are nested', () => {
    const tree = createStarterGraphic('hierarchy-tree');
    expect(tree.items).toHaveLength(1);
    // SWOT draws one quadrant per top-level item: the lifted tree fills one.
    const swot = switchGraphicLayout(tree, 'matrix-swot');
    expect(swot.items).toHaveLength(4);
    expect(swot.items[0].children).toHaveLength(countGraphicNodes(tree.items) - 1);
    expect(flattenGraphicLabels(swot)).toEqual(expect.arrayContaining(flattenGraphicLabels(tree)));
    for (const layoutId of ['list-cards', 'timeline-vertical', 'timeline-alternating'] as const) {
      expect(switchGraphicLayout(tree, layoutId).items).toHaveLength(2);
    }

    // An empty quadrant cannot go once four remain; details and quadrants
    // whose details take their place can.
    const lastQuadrant = swot.items[3];
    expect(canRemoveGraphicItem(swot, lastQuadrant.id)).toBe(false);
    expect(removeGraphicItem(swot, lastQuadrant.id)).toBe(swot);
    expect(canRemoveGraphicItem(swot, swot.items[0].children[0].id)).toBe(true);
    expect(canRemoveGraphicItem(swot, swot.items[0].id)).toBe(true);
    expect(removeGraphicItem(swot, swot.items[0].id).items).toHaveLength(3 + swot.items[0].children.length);

    // Nesting a quadrant under another would leave three: it stays put.
    expect(canDemoteGraphicItem(swot, swot.items[1].id)).toBe(false);
    expect(demoteGraphicItem(swot, swot.items[1].id)).toBe(swot);
    const five = insertGraphicItem(swot, swot.items[3].id).model;
    expect(canDemoteGraphicItem(five, five.items[4].id)).toBe(true);
    expect(demoteGraphicItem(five, five.items[4].id).items).toHaveLength(4);
  });

  it('numbers new headings and details separately in card-style layouts', () => {
    const cards = createStarterGraphic('list-cards');
    const detail = cards.items[0].children[1];
    const added = insertGraphicItem(cards, detail.id);
    expect(added.itemId).not.toBeNull();
    expect(added.model.items[0].children[2]).toMatchObject({ id: added.itemId, label: 'Text 7' });

    const heading = insertGraphicItem(cards, cards.items[2].id);
    expect(heading.model.items[3]).toMatchObject({ id: heading.itemId, label: 'Topic 4' });

    const child = insertGraphicChild(cards, cards.items[1].id);
    expect(child.model.items[1].children.at(-1)).toMatchObject({ id: child.itemId, label: 'Text 7' });
    expect(canAddGraphicChild(cards, detail.id)).toBe(false);
    expect(insertGraphicChild(cards, detail.id).itemId).toBeNull();

    const steps = createStarterGraphic('process-steps');
    expect(insertGraphicItem(steps).model.items.at(-1)?.label).toBe('Step 5');
    expect(canAddGraphicChild(steps, steps.items[0].id)).toBe(false);
  });

  it('stops adding at the layout bound and reports no new item', () => {
    let model = createStarterGraphic('relationship-venn');
    model = insertGraphicItem(model).model;
    expect(model.items).toHaveLength(4);
    const blocked = insertGraphicItem(model, model.items[0].id);
    expect(blocked.itemId).toBeNull();
    expect(blocked.model).toBe(model);
  });

  it('reports which moves and level changes are possible', () => {
    const org = createStarterGraphic('hierarchy-org');
    const [root] = org.items;
    const [first, middle, last] = root.children;
    expect(canMoveGraphicItem(org, first.id, 'up')).toBe(false);
    expect(canMoveGraphicItem(org, first.id, 'down')).toBe(true);
    expect(canMoveGraphicItem(org, last.id, 'down')).toBe(false);
    expect(canMoveGraphicItem(org, null, 'down')).toBe(false);
    // Moves past either end change nothing, so no edit is recorded.
    expect(moveGraphicItem(org, first.id, 'up')).toBe(org);
    expect(moveGraphicItem(org, last.id, 'down')).toBe(org);
    expect(canPromoteGraphicItem(org, root.id)).toBe(false);
    expect(canPromoteGraphicItem(org, middle.id)).toBe(true);
    expect(canPromoteGraphicItem(createStarterGraphic('list-block'), first.id)).toBe(false);
    expect(findGraphicItemDepth(org.items, middle.children[0].id)).toBe(3);
  });

  it('chooses a sensible selection after removing an item', () => {
    const org = createStarterGraphic('hierarchy-org');
    const [root] = org.items;
    const [first, middle, last] = root.children;
    expect(graphicSelectionAfterRemoval(org, middle.id)).toBe(middle.children[0].id);
    expect(graphicSelectionAfterRemoval(org, last.id)).toBe(middle.id);
    expect(graphicSelectionAfterRemoval(org, first.id)).toBe(middle.id);
    expect(graphicSelectionAfterRemoval(org, middle.children[0].id)).toBe(middle.id);
    expect(graphicSelectionAfterRemoval(org, 'missing')).toBeNull();
  });

  it('marks ordered layouts for numbered exports', () => {
    expect(isSequentialGraphicLayout('process-chevron')).toBe(true);
    expect(isSequentialGraphicLayout('cycle-basic')).toBe(true);
    expect(isSequentialGraphicLayout('timeline-vertical')).toBe(true);
    expect(isSequentialGraphicLayout('list-numbered')).toBe(true);
    expect(isSequentialGraphicLayout('list-block')).toBe(false);
    expect(isSequentialGraphicLayout('hierarchy-org')).toBe(false);
    expect(isSequentialGraphicLayout('unknown-layout')).toBe(false);
  });
});
