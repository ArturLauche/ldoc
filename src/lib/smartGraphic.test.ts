import { describe, expect, it } from 'vitest';
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
} from './smartGraphic';

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
});
