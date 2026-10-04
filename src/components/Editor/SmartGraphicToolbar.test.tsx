import { Editor, EditorContent } from '@tiptap/react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { writeStoredLocale } from '@/lib/localePreference';
import {
  coerceGraphic,
  flattenGraphicLabels,
  type SmartGraphicLayoutId,
  type SmartGraphicModel,
} from '@/lib/smartGraphic';
import { createEditorExtensions } from './editorExtensions';
import { SmartGraphicToolbar } from './SmartGraphicToolbar';

let editor: Editor;

function graphic(): SmartGraphicModel {
  const node = editor.getJSON().content?.find((item) => item.type === 'smartGraphic');
  return coerceGraphic(node?.attrs?.graphic);
}

function setup(layoutId: SmartGraphicLayoutId) {
  editor = new Editor({ extensions: createEditorExtensions(() => 'Start writing...'), content: '<p></p>' });
  editor.commands.insertSmartGraphic(layoutId);
  const user = userEvent.setup();
  render(
    <LocaleProvider>
      <TooltipProvider>
        <SmartGraphicToolbar editor={editor} showInsert={false} />
        <EditorContent editor={editor} />
      </TooltipProvider>
    </LocaleProvider>,
  );
  return user;
}

/** Clicks a shape in the document, which selects it for the toolbar. */
async function selectShape(user: ReturnType<typeof userEvent.setup>, label: string) {
  const shape = document.querySelector(`.lwrite-graphic-canvas textarea[aria-label="${label}"]`);
  if (!shape) throw new Error(`no shape labeled ${label}`);
  await user.click(shape);
}

const button = (name: string) => screen.getByRole('button', { name });

describe('smart graphic toolbar', () => {
  beforeEach(() => {
    writeStoredLocale('en');
  });

  afterEach(() => {
    cleanup();
    act(() => editor?.destroy());
  });

  it('asks for a selection before item actions and explains limits', async () => {
    const user = setup('matrix-grid');
    for (const name of ['Remove item', 'Move up', 'Move down']) {
      expect(button(name)).toHaveAttribute('aria-disabled', 'true');
    }
    // A full layout keeps "Add item" focusable but unavailable.
    expect(button('Add item')).toHaveAttribute('aria-disabled', 'true');
    await user.click(button('Remove item'));
    expect(graphic().items).toHaveLength(4);

    await selectShape(user, 'Text 1');
    expect(button('Move down')).not.toHaveAttribute('aria-disabled');
    expect(button('Move up')).toHaveAttribute('aria-disabled', 'true');
    // The matrix needs all four quadrants.
    expect(button('Remove item')).toHaveAttribute('aria-disabled', 'true');
  });

  it('adds after the selection, focuses the new label and selects a neighbor after removal', async () => {
    const user = setup('process-steps');
    await selectShape(user, 'Step 2');
    await user.click(button('Add item'));
    expect(flattenGraphicLabels(graphic())).toEqual(['Step 1', 'Step 2', 'Step 5', 'Step 3', 'Step 4']);
    const added = graphic().items[2];
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-graphic-label', added.id),
    );
    expect(editor.storage.smartGraphic.activeItemId).toBe(added.id);

    await user.click(button('Remove item'));
    expect(flattenGraphicLabels(graphic())).toEqual(['Step 1', 'Step 2', 'Step 3', 'Step 4']);
    expect(editor.storage.smartGraphic.activeItemId).toBe(graphic().items[1].id);

    await user.click(button('Move down'));
    expect(flattenGraphicLabels(graphic())).toEqual(['Step 1', 'Step 3', 'Step 2', 'Step 4']);
  });

  it('adds sub-items and changes levels in hierarchies', async () => {
    const user = setup('hierarchy-org');
    await selectShape(user, 'Topic 2');
    expect(button('Promote')).not.toHaveAttribute('aria-disabled');
    await user.click(button('Add sub-item'));
    expect(graphic().items[0].children[0].children.map((item) => item.label)).toEqual(['Topic 6']);

    await selectShape(user, 'Topic 5');
    await user.click(button('Demote'));
    expect(graphic().items[0].children[1].children.map((item) => item.label)).toEqual(['Topic 4', 'Topic 5']);
    await user.click(button('Promote'));
    expect(graphic().items[0].children.map((item) => item.label)).toEqual(['Topic 2', 'Topic 3', 'Topic 5']);
  });

  it('previews the user’s own text in the layout picker and switches without losing it', async () => {
    const user = setup('list-block');
    await selectShape(user, 'Text 1');
    await user.keyboard('{Control>}a{/Control}Research');
    await user.click(button('Change layout'));
    const picker = screen.getByRole('dialog');
    expect(within(picker).getByRole('button', { name: 'Block List' })).toHaveAttribute('aria-current', 'true');
    // Thumbnails render the document's content, not placeholder text.
    expect(within(picker).getAllByText('Research').length).toBeGreaterThan(1);

    await user.click(within(picker).getByRole('button', { name: 'Timeline' }));
    await user.click(within(picker).getByRole('button', { name: 'Vertical Timeline' }));
    expect(graphic().layoutId).toBe('timeline-vertical');
    expect(flattenGraphicLabels(graphic())[0]).toBe('Research');
    // The picker stays open to compare layouts.
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Vertical Timeline' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('changes colors and style from visual samples', async () => {
    const user = setup('cycle-segmented');
    await user.click(button('Colors and style'));
    await user.click(screen.getByRole('button', { name: 'Purple' }));
    await user.click(screen.getByRole('button', { name: 'Outline' }));
    expect(graphic()).toMatchObject({ colorSet: 'purple', style: 'outline' });
    expect(screen.getByRole('button', { name: 'Purple' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.lwrite-graphic-view .lwrite-graphic-canvas')).toHaveAttribute('data-color', 'purple');
  });

  it('edits the outline with outliner keys in the text pane', async () => {
    const user = setup('hierarchy-org');
    await user.click(button('Text pane'));
    const pane = screen.getByRole('dialog', { name: 'Text pane' });
    expect(within(pane).getByText('5 of 12 items')).toBeInTheDocument();

    await user.click(within(pane).getByRole('textbox', { name: 'Topic 2' }));
    await user.keyboard('{Enter}');
    expect(flattenGraphicLabels(graphic())).toEqual(['Topic 1', 'Topic 2', 'Topic 6', 'Topic 3', 'Topic 4', 'Topic 5']);
    const added = within(pane).getByRole('textbox', { name: 'Topic 6' });
    await waitFor(() => expect(added).toHaveFocus());

    // Tab nests under the previous sibling; Shift+Tab lifts it back out.
    await user.keyboard('{Tab}');
    expect(graphic().items[0].children[0].children.map((item) => item.label)).toEqual(['Topic 6']);
    await waitFor(() => expect(within(pane).getByRole('textbox', { name: 'Topic 6' })).toHaveFocus());
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(graphic().items[0].children.map((item) => item.label)).toEqual(['Topic 2', 'Topic 6', 'Topic 3', 'Topic 5']);

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(graphic().items[0].children.map((item) => item.label)).toEqual(['Topic 6', 'Topic 2', 'Topic 3', 'Topic 5']);
    // At the top of its level there is nothing to move: no edit, no undo step.
    const before = editor.state.doc;
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(editor.state.doc).toBe(before);

    // Clearing an item and pressing Backspace removes it.
    const current = within(pane).getByRole('textbox', { name: 'Topic 6' });
    await user.clear(current);
    await user.keyboard('{Backspace}');
    expect(flattenGraphicLabels(graphic())).toEqual(['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5']);
    await waitFor(() => expect(within(pane).getByRole('textbox', { name: 'Topic 1' })).toHaveFocus());
  });

  it('numbers milestones like exports do and keeps their details as bullets', async () => {
    const user = setup('timeline-vertical');
    await user.click(button('Text pane'));
    const pane = screen.getByRole('dialog', { name: 'Text pane' });
    await user.click(within(pane).getByRole('textbox', { name: 'Milestone 2' }));
    await user.keyboard('{Tab}');
    expect(graphic().items[0].children.map((item) => item.label)).toEqual(['Milestone 2']);
    const marker = (name: string) => within(pane).getByRole('textbox', { name }).previousElementSibling?.textContent;
    expect(['Milestone 1', 'Milestone 2', 'Milestone 3', 'Milestone 4'].map(marker)).toEqual(['1', '•', '2', '3']);
  });

  it('returns to the document with Escape and deletes the whole graphic', async () => {
    const user = setup('relationship-venn');
    await selectShape(user, 'Text 2');
    await user.keyboard('{Escape}');
    // TipTap applies focus on the next animation frame.
    await waitFor(() => expect(editor.view.hasFocus()).toBe(true));
    expect(editor.isActive('smartGraphic')).toBe(true);

    await user.click(button('Delete graphic'));
    expect(editor.getJSON().content?.some((item) => item.type === 'smartGraphic')).toBe(false);
  });
});
