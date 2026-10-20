import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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

describe('ConfirmProvider', () => {
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
