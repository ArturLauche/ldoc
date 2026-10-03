import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTouchSafeMenu } from './useTouchSafeMenu';

function Menu() {
  const menu = useTouchSafeMenu();
  return (
    <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild {...menu.triggerProps}>
        <button type="button">Actions</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('useTouchSafeMenu', () => {
  it('does not open when a touch gesture merely starts on the trigger', () => {
    render(<Menu />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Actions' }), {
      pointerType: 'touch',
      button: 0,
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on a completed tap', async () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    fireEvent.pointerDown(trigger, { pointerType: 'touch', button: 0 });
    fireEvent.click(trigger);
    expect(await screen.findByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument();
  });

  it('keeps the default mouse and keyboard behavior', async () => {
    const user = userEvent.setup();
    render(<Menu />);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    screen.getByRole('button', { name: 'Actions' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });
});
