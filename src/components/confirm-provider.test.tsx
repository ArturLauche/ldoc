import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/hooks/useConfirm';
import { trackInputModality } from '@/lib/inputModality';
import { ConfirmProvider } from './confirm-provider';
import { LocaleProvider } from './locale-provider';

function Library() {
  const confirm = useConfirm();
  const [rows, setRows] = useState(['Draft']);
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Library</DialogTitle>
        <DialogDescription>Saved documents</DialogDescription>
        <input aria-label="Search" />
        {rows.map((row) => (
          <button
            key={row}
            type="button"
            onClick={async () => {
              if (await confirm({ title: `Delete ${row}?`, confirmLabel: 'Delete' })) setRows([]);
            }}
          >
            Delete {row}
          </button>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function FileMenu() {
  const confirm = useConfirm();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>File</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void confirm({ title: 'Discard changes?' })}>New</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelfControlledMenu() {
  const confirm = useConfirm();
  // Broken markup: the item names its own menu as the one it controls.
  return (
    <div role="menu" id="loop-menu">
      <button type="button" aria-controls="loop-menu" onClick={() => void confirm({ title: 'Sure?' })}>
        Ask
      </button>
    </div>
  );
}

describe('ConfirmProvider', () => {
  it('does not loop when a menu item controls its own menu', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <SelfControlledMenu />
        </ConfirmProvider>
      </LocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('returns focus to the menu button when a menu item asked', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <FileMenu />
        </ConfirmProvider>
      </LocaleProvider>,
    );
    screen.getByRole('button', { name: 'File' }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'New' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(screen.getByRole('button', { name: 'File' })).toHaveFocus();
  });

  it('keeps focus in the dialog when the element that asked is gone', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <ConfirmProvider>
          <Library />
        </ConfirmProvider>
      </LocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Delete Draft' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus());
  });

  it('focuses the dialog itself after a tap, so no software keyboard opens', async () => {
    const stop = trackInputModality();
    try {
      render(
        <LocaleProvider>
          <ConfirmProvider>
            <Library />
          </ConfirmProvider>
        </LocaleProvider>,
      );
      const trigger = screen.getByRole('button', { name: 'Delete Draft' });
      fireEvent.pointerDown(trigger, { pointerType: 'touch' });
      trigger.focus();
      fireEvent.click(trigger);
      const confirmButton = await screen.findByRole('button', { name: 'Delete' });
      fireEvent.pointerDown(confirmButton, { pointerType: 'touch' });
      fireEvent.click(confirmButton);
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      // Focus moves back in the next frame.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      expect(screen.getByRole('dialog', { name: 'Library' })).toHaveFocus();
    } finally {
      stop();
    }
  });
});
