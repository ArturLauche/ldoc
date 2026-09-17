import { Editor, EditorContent } from '@tiptap/react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useLocale } from '@/hooks/useLocale';
import { writeStoredLocale } from '@/lib/localePreference';
import { t } from '@/lib/translations';
import {
  SMART_GRAPHIC_LAYOUTS,
  addGraphicItem,
  coerceGraphic,
  flattenGraphicLabels,
  getSmartGraphicLayout,
  removeGraphicItem,
  serializeSmartGraphic,
  switchGraphicLayout,
  updateItemLabel,
  updateGraphicTitle,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { createEditorExtensions } from './editorExtensions';
import { SmartGraphicGallery } from './SmartGraphicGallery';
import { SmartGraphicToolbar } from './SmartGraphicToolbar';
import { GRAPHIC_CATEGORY_KEYS, GRAPHIC_LAYOUT_KEYS } from './smartGraphicLabels';

function GermanLanguageSwitch() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale('de')}>Deutsch</button>;
}

async function typeMultiwordText(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
  readValue: () => string,
) {
  await user.clear(input);
  await user.type(input, 'Hello ');
  expect.soft(input).toHaveValue('Hello ');
  expect.soft(input).toHaveFocus();
  expect.soft(readValue()).toBe('Hello ');
  await user.type(input, 'world');
  expect(input).toHaveValue('Hello world');
  expect(input).toHaveFocus();
  expect(readValue()).toBe('Hello world');
}

function renderEditorWithToolbar(editor: Editor) {
  return renderWithProviders(
    <>
      <SmartGraphicToolbar editor={editor} />
      <EditorContent editor={editor} />
    </>,
  );
}

function renderWithProviders(ui: ReactElement) {
  return render(
    <LocaleProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </LocaleProvider>,
  );
}

function createTestEditor(content = '<p></p>') {
  return new Editor({
    extensions: createEditorExtensions(() => 'Start writing...'),
    content,
  });
}

function graphicFromEditor(editor: Editor): SmartGraphicModel {
  const json = editor.getJSON();
  const node = json.content?.find((item) => item.type === 'smartGraphic');
  return coerceGraphic(node?.attrs?.graphic);
}

describe('smart graphic insert and editing', () => {
  let editor: Editor;

  beforeEach(() => {
    writeStoredLocale('en');
  });

  afterEach(() => {
    cleanup();
    act(() => editor?.destroy());
  });

  it('inserts a layout from the gallery and keeps labels when switching layouts', async () => {
    const user = userEvent.setup();
    editor = createTestEditor();
    renderWithProviders(<SmartGraphicGallery editor={editor} />);

    await user.click(screen.getByRole('button', { name: 'Insert graphic' }));
    expect(screen.getByText('Insert Graphic')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Process' }));
    expect(screen.getAllByTestId('graphic-preview-frame').length).toBeGreaterThan(0);
    screen.getAllByTestId('graphic-preview-frame').forEach((frame) => {
      expect(frame).toHaveClass('h-36', 'items-center', 'justify-center');
      expect(frame.querySelector('[data-compact="true"]')).toBeTruthy();
    });
    expect(screen.getByTestId('graphic-layout-process-chevron')).toHaveClass('flex-nowrap');
    expect(screen.getByTestId('graphic-layout-process-steps')).toHaveClass('flex-nowrap');
    await user.click(screen.getByRole('button', { name: 'Chevron Process' }));

    expect(editor.isActive('smartGraphic')).toBe(true);
    const inserted = graphicFromEditor(editor);
    expect(inserted.layoutId).toBe('process-chevron');

    const labeled = updateItemLabel(inserted, inserted.items[0].id, 'Launch');
    editor.commands.updateSmartGraphic(labeled);
    editor.commands.updateSmartGraphic(switchGraphicLayout(graphicFromEditor(editor), 'list-block'));
    expect(flattenGraphicLabels(graphicFromEditor(editor))).toContain('Launch');
  });

  it('adds and removes nodes through the structured model', () => {
    editor = createTestEditor();
    editor.commands.insertSmartGraphic('list-block');
    const start = graphicFromEditor(editor);
    const withItem = addGraphicItem(start, start.items[0].id);
    editor.commands.updateSmartGraphic(withItem);
    expect(graphicFromEditor(editor).items.length).toBeGreaterThan(start.items.length);

    const trimmed = removeGraphicItem(graphicFromEditor(editor), graphicFromEditor(editor).items[1].id);
    editor.commands.updateSmartGraphic(trimmed);
    expect(graphicFromEditor(editor).items.length).toBe(start.items.length);
  });

  it('loads stored graphic HTML and never revives the old smart diagram node', () => {
    const model = {
      version: 1 as const,
      layoutId: 'cycle-basic' as const,
      colorSet: 'blue' as const,
      style: 'filled' as const,
      title: 'Cycle',
      items: [
        { id: 'a1', label: 'One', children: [] },
        { id: 'b2', label: 'Two', children: [] },
        { id: 'c3', label: 'Three', children: [] },
      ],
    };
    editor = createTestEditor(
      `<div data-lwrite-graphic='${serializeSmartGraphic(model)}'><ul><li>One</li><li>Two</li><li>Three</li></ul></div>`,
    );

    expect(editor.schema.nodes.smartGraphic).toBeDefined();
    expect(editor.schema.nodes.smartDiagram).toBeUndefined();
    expect(editor.getHTML()).toContain('data-lwrite-graphic');
    expect(flattenGraphicLabels(graphicFromEditor(editor))).toEqual(['One', 'Two', 'Three']);
  });

  it('rebuilds a graphic from malformed JSON using the list fallback', () => {
    editor = createTestEditor(
      '<div data-lwrite-graphic="{not json}"><ul><li>Alpha</li><li>Beta</li></ul></div>',
    );
    expect(editor.isActive('smartGraphic') || editor.getJSON().content?.some((item) => item.type === 'smartGraphic')).toBe(
      true,
    );
    expect(flattenGraphicLabels(graphicFromEditor(editor))).toEqual(['Alpha', 'Beta']);
  });

  it('does not create a graphic from malformed JSON without usable content', () => {
    editor = createTestEditor('<div data-lwrite-graphic="{not json}"></div>');
    expect(editor.getJSON().content?.some((item) => item.type === 'smartGraphic')).toBeFalsy();
  });

  it('selects the newly inserted graphic even when another graphic follows', () => {
    editor = createTestEditor();
    editor.commands.insertSmartGraphic('list-block');
    editor.commands.insertContentAt(0, { type: 'paragraph' });
    editor.commands.setTextSelection(1);
    editor.commands.insertSmartGraphic('process-chevron');
    expect(editor.isActive('smartGraphic')).toBe(true);
    expect(coerceGraphic(editor.getAttributes('smartGraphic').graphic).layoutId).toBe('process-chevron');
  });

  it('includes graphic labels in document text', () => {
    editor = createTestEditor();
    editor.commands.insertSmartGraphic('list-block');
    const labeled = updateItemLabel(graphicFromEditor(editor), graphicFromEditor(editor).items[0].id, 'Counted');
    editor.commands.updateSmartGraphic(updateGraphicTitle(labeled, 'Title'));
    expect(editor.getText()).toContain('Counted');
    expect(editor.getText()).toContain('Title');
  });

  it('selects an item without changing document history or mutating a can() check', () => {
    editor = createTestEditor();
    editor.commands.insertSmartGraphic('list-block');
    const id = graphicFromEditor(editor).items[0].id;
    const content = editor.getHTML();
    expect(editor.can().selectSmartGraphicItem(id)).toBe(true);
    expect(editor.storage.smartGraphic.activeItemId).toBeNull();
    editor.commands.selectSmartGraphicItem(id);
    expect(editor.storage.smartGraphic.activeItemId).toBe(id);
    expect(editor.getHTML()).toBe(content);
    editor.commands.undo();
    expect(editor.getJSON().content?.some((node) => node.type === 'smartGraphic')).toBe(false);
  });

  it('updates the localized placeholder without document changes or an extra undo step', () => {
    editor = createTestEditor();
    expect(editor.view.dom.querySelector('[data-placeholder]')?.getAttribute('data-placeholder'))
      .toBe('Start writing...');
    editor.commands.setEditorPlaceholder('Beginne zu schreiben…');
    expect(editor.view.dom.querySelector('[data-placeholder]')?.getAttribute('data-placeholder'))
      .toBe('Beginne zu schreiben…');
    expect(editor.can().undo()).toBe(false);
    editor.commands.insertContent('A draft');
    editor.commands.setEditorPlaceholder('Commencez à écrire…');
    expect(editor.getText()).toBe('A draft');
    editor.commands.undo();
    expect(editor.isEmpty).toBe(true);
    expect(editor.view.dom.querySelector('[data-placeholder]')?.getAttribute('data-placeholder'))
      .toBe('Commencez à écrire…');
  });

  it.each(SMART_GRAPHIC_LAYOUTS.map((layout) => [layout.id, layout] as const))(
    'types a multiword label and title into %s through the node view',
    async (layoutId, layout) => {
      const user = userEvent.setup();
      editor = createTestEditor();
      renderEditorWithToolbar(editor);

      await user.click(screen.getByRole('button', { name: 'Insert graphic' }));
      await user.click(screen.getByRole('tab', { name: t('en', GRAPHIC_CATEGORY_KEYS[layout.category]) }));
      await user.click(screen.getByRole('button', { name: t('en', GRAPHIC_LAYOUT_KEYS[layoutId]) }));
      expect(editor.isActive('smartGraphic')).toBe(true);
      const inserted = graphicFromEditor(editor);
      expect(inserted.layoutId).toBe(layoutId);

      const canvas = document.querySelector('.lwrite-graphic-canvas[data-compact="false"]');
      expect(canvas).toBeTruthy();
      const shapeInputs = Array.from(canvas?.querySelectorAll('input') ?? []);
      expect(shapeInputs.length).toBeGreaterThan(0);
      await typeMultiwordText(user, shapeInputs[0]!, () => graphicFromEditor(editor).items[0].label);

      await user.click(screen.getByRole('button', { name: 'Text pane' }));
      const pane = screen.getByRole('dialog', { name: 'Text pane' });
      const paneTitle = within(pane).getByRole('textbox', { name: 'Title' });
      await typeMultiwordText(user, paneTitle, () => graphicFromEditor(editor).title);
      await typeMultiwordText(user, within(pane).getByRole('textbox', { name: 'Hello world' }), () => graphicFromEditor(editor).items[0].label);
      expect(shapeInputs[0]).toHaveValue('Hello world');

      if (layout.supportsHierarchy) {
        const treeInputs = within(pane).getAllByRole('textbox');
        expect(treeInputs.length).toBeGreaterThanOrEqual(5);
        const nested = graphicFromEditor(editor).items[0].children[1].children[0];
        expect(nested).toBeDefined();
        await typeMultiwordText(user, treeInputs[4]!, () => graphicFromEditor(editor).items[0].children[1].children[0].label);
        expect(graphicFromEditor(editor).items[0].children[1].children[0].label).toBe('Hello world');
      }
    },
    20000,
  );

  it.each(SMART_GRAPHIC_LAYOUTS.map((layout) => [layout.id] as const))(
    'localizes the preview and inserted labels for %s after a language change',
    async (layoutId) => {
      const user = userEvent.setup();
      editor = createTestEditor();
      renderWithProviders(<><GermanLanguageSwitch /><SmartGraphicToolbar editor={editor} /></>);
      await user.click(screen.getByRole('button', { name: 'Deutsch' }));
      await user.click(screen.getByRole('button', { name: t('de', 'toolbarInsertGraphic') }));
      const layout = getSmartGraphicLayout(layoutId);
      await user.click(screen.getByRole('tab', { name: t('de', GRAPHIC_CATEGORY_KEYS[layout.category]) }));
      const choice = screen.getByRole('button', { name: t('de', GRAPHIC_LAYOUT_KEYS[layoutId]) });
      const word = { item: 'Text', step: 'Schritt', topic: 'Thema', level: 'Ebene' }[layout.placeholderKind];
      expect(within(choice).getByText(`${word} 1`)).toBeInTheDocument();
      await user.click(choice);
      const inserted = graphicFromEditor(editor);
      expect(inserted.layoutId).toBe(layoutId);
      expect(flattenGraphicLabels(inserted)).toEqual(
        Array.from({ length: layout.starterCount }, (_, index) => `${word} ${index + 1}`),
      );
      if (layout.maxItems > layout.starterCount) {
        await user.click(screen.getByRole('button', { name: t('de', 'graphicAddItem') }));
        expect(flattenGraphicLabels(graphicFromEditor(editor))).toContain(`${word} ${layout.starterCount + 1}`);
      }
    },
  );
});
