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
    expect(parsed?.items).toHaveLength(4);
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
