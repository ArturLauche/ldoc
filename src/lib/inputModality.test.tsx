import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  focusContainerOnTouch,
  getInputModality,
  isTouchInteraction,
  keepEditorFocus,
  trackInputModality,
} from './inputModality';

function pointerDown(pointerType: string) {
  window.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }));
}

describe('input modality tracking', () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it('records touch, mouse and keyboard navigation', () => {
    stop = trackInputModality();
    pointerDown('touch');
    expect(isTouchInteraction()).toBe(true);
    pointerDown('mouse');
    expect(getInputModality()).toBe('mouse');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(getInputModality()).toBe('keyboard');
    // Typing characters is not a navigation choice.
    pointerDown('pen');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(isTouchInteraction()).toBe(true);
  });

  it('shares listeners between nested trackers and removes them with the last one', () => {
    const first = trackInputModality();
    const second = trackInputModality();
    first();
    pointerDown('touch');
    expect(isTouchInteraction()).toBe(true);
    second();
    pointerDown('mouse');
    expect(isTouchInteraction()).toBe(true);
  });

  it('ignores a repeated cleanup call', () => {
    const first = trackInputModality();
    pointerDown('mouse');
    first();
    first();
    const second = trackInputModality();
    pointerDown('touch');
    expect(isTouchInteraction()).toBe(true);
    second();
  });
});

describe('keepEditorFocus', () => {
  function mouseDownOn(target: Element, currentTarget: Element) {
    const preventDefault = vi.fn();
    keepEditorFocus({ target, currentTarget, preventDefault });
    return preventDefault;
  }

  it('keeps focus in the editor when a toolbar button is pressed', () => {
    const toolbar = document.createElement('div');
    const button = document.createElement('button');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    button.append(icon);
    toolbar.append(button);
    expect(mouseDownOn(button, toolbar)).toHaveBeenCalled();
    expect(mouseDownOn(icon, toolbar)).toHaveBeenCalled();
  });

  it('lets text fields and portaled overlays receive focus', () => {
    const toolbar = document.createElement('div');
    const input = document.createElement('input');
    toolbar.append(input);
    const portaled = document.createElement('button');
    expect(mouseDownOn(input, toolbar)).not.toHaveBeenCalled();
    expect(mouseDownOn(portaled, toolbar)).not.toHaveBeenCalled();
  });
});

describe('focusContainerOnTouch', () => {
  afterEach(() => {
    pointerDown('mouse');
  });

  it('focuses the dialog itself after a tap and its first field otherwise', async () => {
    const stop = trackInputModality();
    const ui = (
      <Dialog open>
        <DialogContent onOpenAutoFocus={focusContainerOnTouch}>
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>Choose a name.</DialogDescription>
          <input aria-label="Name" />
        </DialogContent>
      </Dialog>
    );

    pointerDown('touch');
    const first = render(ui);
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    first.unmount();

    pointerDown('mouse');
    render(ui);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus());
    stop();
  });
});
