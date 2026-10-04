import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { writeStoredLocale } from '@/lib/localePreference';
import {
  SMART_GRAPHIC_LAYOUTS,
  createStarterGraphic,
  flattenGraphicItems,
  getSmartGraphicLayout,
  parseSmartGraphicJson,
  switchGraphicLayout,
  type SmartGraphicItem,
  type SmartGraphicLayoutId,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { SmartGraphicCanvas } from './SmartGraphicCanvas';

let nextId = 0;
const node = (label: string, children: SmartGraphicItem[] = []): SmartGraphicItem => ({
  id: `n${(nextId += 1)}`,
  label,
  children,
});

function flatGraphic(layoutId: SmartGraphicLayoutId, count: number): SmartGraphicModel {
  const model = parseSmartGraphicJson({
    version: 1,
    layoutId,
    colorSet: 'blue',
    style: 'filled',
    title: '',
    items: Array.from({ length: count }, (_, index) => node(`Label ${index + 1}`)),
  });
  if (!model) throw new Error(`could not build ${layoutId}`);
  return model;
}

/** Twelve nodes, three levels: the largest tree any layout accepts. */
function broadTree(layoutId: SmartGraphicLayoutId): SmartGraphicModel {
  return switchGraphicLayout(
    {
      ...createStarterGraphic('hierarchy-org'),
      items: [
        node('Chief', [
          node('Engineering', [node('Platform'), node('Mobile'), node('Quality')]),
          node('Marketing', [node('Brand'), node('Growth')]),
          node('Operations', [node('Finance'), node('People')]),
        ]),
      ],
    },
    layoutId,
  );
}

function sizesFor(layoutId: SmartGraphicLayoutId): SmartGraphicModel[] {
  const layout = getSmartGraphicLayout(layoutId);
  if (layout.supportsHierarchy) return [createStarterGraphic(layoutId), broadTree(layoutId)];
  return [flatGraphic(layoutId, layout.minItems), createStarterGraphic(layoutId), flatGraphic(layoutId, layout.maxItems)];
}

function renderCanvas(graphic: SmartGraphicModel, props: Partial<Parameters<typeof SmartGraphicCanvas>[0]> = {}) {
  return render(<SmartGraphicCanvas graphic={graphic} editable {...props} />);
}

describe('SmartGraphicCanvas', () => {
  beforeEach(() => {
    writeStoredLocale('en');
  });

  it.each(SMART_GRAPHIC_LAYOUTS.map((layout) => layout.id))(
    'renders every item of %s as an editable label in reading order at each size',
    (layoutId) => {
      for (const graphic of sizesFor(layoutId)) {
        const { container, unmount } = renderCanvas(graphic);
        const expected = flattenGraphicItems(graphic.items);
        const labels = Array.from(container.querySelectorAll<HTMLTextAreaElement>('textarea[data-graphic-label]'));
        // Tab and Enter follow the item order, whatever the visual arrangement.
        expect(labels.map((label) => label.dataset.graphicLabel)).toEqual(expected.map((item) => item.id));
        expect(labels.map((label) => label.value)).toEqual(expected.map((item) => item.label));
        expect(container.querySelectorAll('[data-graphic-item]')).toHaveLength(expected.length);
        expect(screen.getByTestId(`graphic-layout-${layoutId}`)).toBeInTheDocument();
        unmount();
      }
    },
  );

  it('renders static thumbnails without editors', () => {
    for (const layout of SMART_GRAPHIC_LAYOUTS) {
      const graphic = createStarterGraphic(layout.id);
      const { container, unmount } = render(<SmartGraphicCanvas graphic={graphic} compact editable />);
      const canvas = container.querySelector('.lwrite-graphic-canvas');
      expect(canvas).toHaveAttribute('data-compact', 'true');
      expect(canvas).toHaveClass('pointer-events-none');
      expect(container.querySelector('textarea')).toBeNull();
      for (const item of flattenGraphicItems(graphic.items)) {
        expect(within(container as HTMLElement).getAllByText(item.label).length).toBeGreaterThan(0);
      }
      unmount();
    }
  });

  it('keeps items beyond a layout’s capacity visible and editable below the diagram', () => {
    const eight = flatGraphic('list-block', 8);
    const matrix = switchGraphicLayout(eight, 'matrix-grid');
    const { container } = renderCanvas(matrix);
    const diagram = screen.getByTestId('graphic-layout-matrix-grid');
    expect(diagram.querySelectorAll('[data-graphic-item]')).toHaveLength(4);
    expect(screen.getByText('Not shown in this layout')).toBeInTheDocument();
    expect(container.querySelectorAll('textarea[data-graphic-label]')).toHaveLength(8);
  });

  it('marks only the selected item and exposes the palette and style', () => {
    const graphic = { ...createStarterGraphic('process-steps'), colorSet: 'green' as const, style: 'outline' as const };
    const target = graphic.items[2];
    const { container } = renderCanvas(graphic, { activeId: target.id });
    const active = container.querySelectorAll('[data-active="true"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('data-graphic-item', target.id);
    const canvas = container.querySelector('.lwrite-graphic-canvas');
    expect(canvas).toHaveAttribute('data-color', 'green');
    expect(canvas).toHaveAttribute('data-style', 'outline');
  });

  it('selects items and reports label edits', async () => {
    const user = userEvent.setup();
    const onSelectItem = vi.fn();
    const onChangeLabel = vi.fn();
    const graphic = createStarterGraphic('list-block');
    const { container } = renderCanvas(graphic, { onSelectItem, onChangeLabel });
    const second = container.querySelector(`[data-graphic-item="${graphic.items[1].id}"]`) as HTMLElement;
    await user.click(second);
    expect(onSelectItem).toHaveBeenCalledWith(graphic.items[1].id);
    await user.type(within(second).getByRole('textbox'), '!');
    expect(onChangeLabel).toHaveBeenLastCalledWith(graphic.items[1].id, 'Text 2!');
  });

  it('moves between labels with Enter and hands focus back with Escape', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    const onChangeLabel = vi.fn();
    const graphic = createStarterGraphic('process-chevron');
    const { container } = renderCanvas(graphic, { onExit, onChangeLabel });
    const labels = Array.from(container.querySelectorAll<HTMLTextAreaElement>('textarea[data-graphic-label]'));
    await user.click(labels[0]);
    await user.keyboard('{Enter}');
    expect(labels[1]).toHaveFocus();
    // The next label's text is selected, ready to be replaced.
    expect([labels[1].selectionStart, labels[1].selectionEnd]).toEqual([0, labels[1].value.length]);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(labels[0]).toHaveFocus();
    // Labels are single paragraphs: Enter never inserts a line break.
    expect(onChangeLabel).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);

    // Past either end, Enter and Shift+Enter continue in the document.
    await user.click(labels[0]);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onExit).toHaveBeenCalledTimes(2);
    await user.click(labels[labels.length - 1]);
    await user.keyboard('{Enter}');
    expect(onExit).toHaveBeenCalledTimes(3);
    expect(onChangeLabel).not.toHaveBeenCalled();
  });

  it('names empty labels after their level', () => {
    const swot = createStarterGraphic('matrix-swot');
    const [quadrant] = swot.items;
    const emptied = {
      ...swot,
      items: [
        { ...quadrant, label: '', children: [{ ...quadrant.children[0], label: '' }] },
        ...swot.items.slice(1),
      ],
    };
    renderCanvas(emptied);
    expect(screen.getByRole('textbox', { name: 'Topic' })).toHaveAttribute('placeholder', 'Topic');
    // Details are bullet points, not headings.
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveAttribute('placeholder', 'Text');
  });

  it('localizes text drawn inside diagrams and empty-label placeholders', () => {
    writeStoredLocale('de');
    const graphic = createStarterGraphic('relationship-opposing', 'de');
    const withEmpty = { ...graphic, items: graphic.items.map((item, index) => (index === 0 ? { ...item, label: '' } : item)) };
    render(
      <LocaleProvider>
        <SmartGraphicCanvas graphic={switchGraphicLayout(withEmpty, 'relationship-opposing', 'de')} editable />
      </LocaleProvider>,
    );
    expect(screen.getByText('vs.')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')[0]).toHaveAttribute('placeholder', 'Text');

    const steps = createStarterGraphic('process-steps', 'de');
    render(
      <LocaleProvider>
        <SmartGraphicCanvas graphic={{ ...steps, items: [{ ...steps.items[0], label: '' }, ...steps.items.slice(1)] }} editable />
      </LocaleProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Schritt' })).toHaveAttribute('placeholder', 'Schritt');
  });

  it('adapts trees, cycles and hubs to the amount of content', () => {
    const small = renderCanvas(createStarterGraphic('hierarchy-org'));
    expect(small.container.querySelector('.sg-org')).not.toHaveAttribute('data-fold');
    small.unmount();

    const broad = renderCanvas(broadTree('hierarchy-org'));
    expect(broad.container.querySelector('.sg-org')).toHaveAttribute('data-fold', 'true');
    // Broad trees hang every leaf group as a list.
    const leafGroups = broad.container.querySelectorAll('.sg-org-children.is-leaves');
    expect(leafGroups).toHaveLength(3);
    leafGroups.forEach((group) => expect(group).toHaveAttribute('data-stack', 'true'));
    broad.unmount();

    const fewSteps = renderCanvas(flatGraphic('cycle-basic', 4));
    expect(fewSteps.container.querySelector('[data-graphic-connector="loop-return"]')).toBeNull();
    fewSteps.unmount();
    const manySteps = renderCanvas(flatGraphic('cycle-basic', 7));
    expect(manySteps.container.querySelector('[data-graphic-connector="loop-return"]')).not.toBeNull();
  });

  it('shows the title above the diagram', () => {
    renderCanvas({ ...createStarterGraphic('pyramid-basic'), title: 'Needs' });
    expect(screen.getByText('Needs')).toBeInTheDocument();
  });
});
