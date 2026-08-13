import { Editor } from '@tiptap/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  addGraphicItem,
  coerceGraphic,
  flattenGraphicLabels,
  removeGraphicItem,
  serializeSmartGraphic,
  switchGraphicLayout,
  updateItemLabel,
  updateGraphicTitle,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { createEditorExtensions } from './editorExtensions';
import { SmartGraphicGallery } from './SmartGraphicGallery';

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

  afterEach(() => {
    editor?.destroy();
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
});
