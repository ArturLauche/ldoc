import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/components/locale-provider';
import { SHORTCUT_GROUPS, SHORTCUTS, type ShortcutId } from './editorShortcuts';
import { ShortcutsDialog } from './ShortcutsDialog';

/** Mirrors the app: the editor owns the open state, the dialog only reports. */
function ShortcutsHarness({ onReturnFocus }: Pick<ComponentProps<typeof ShortcutsDialog>, 'onReturnFocus'>) {
  const [open, setOpen] = useState(true);
  return (
    <LocaleProvider>
      <ShortcutsDialog open={open} onOpenChange={setOpen} onReturnFocus={onReturnFocus} />
    </LocaleProvider>
  );
}

function renderShortcuts() {
  const onReturnFocus = vi.fn();
  render(<ShortcutsHarness onReturnFocus={onReturnFocus} />);
  return { onReturnFocus };
}

/** The `kbd` chips of the row labeled `label`, in key order. */
function keysOfRow(label: string): (string | null)[] {
  const row = screen.getByText(label).closest('div');
  expect(row).not.toBeNull();
  return Array.from(row!.querySelectorAll('kbd')).map((kbd) => kbd.textContent);
}

describe('shortcuts dialog', () => {
  it('lists every shortcut in the model exactly once', () => {
    renderShortcuts();
    const allIds = Object.keys(SHORTCUTS) as ShortcutId[];
    const listedIds = SHORTCUT_GROUPS.flatMap((group) => group.items.map((item) => item.id));
    // New shortcuts only reach users when a group lists them.
    expect(listedIds).toHaveLength(allIds.length);
    expect(new Set(listedIds).size).toBe(allIds.length);

    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('dt')).toHaveLength(allIds.length);
    for (const name of ['General', 'Text', 'Paragraphs and lists']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('renders one chip per key in the order the keys are pressed', () => {
    renderShortcuts();
    expect(keysOfRow('Redo')).toEqual(['Ctrl', 'Shift', 'Z']);
    expect(keysOfRow('Bold')).toEqual(['Ctrl', 'B']);
    expect(keysOfRow('Line break')).toEqual(['Shift', 'Enter']);
  });

  it('includes the print shortcut', () => {
    renderShortcuts();
    expect(SHORTCUTS.print).toBe('Mod+P');
    expect(keysOfRow('Print…')).toEqual(['Ctrl', 'P']);
  });

  it('hands focus back when it closes', async () => {
    const user = userEvent.setup();
    const { onReturnFocus } = renderShortcuts();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onReturnFocus).toHaveBeenCalled();
  });
});
