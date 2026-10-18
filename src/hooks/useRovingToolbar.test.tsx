import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRovingToolbar } from './useRovingToolbar';

function Toolbar() {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useRovingToolbar(ref);
  const [undoEnabled, setUndoEnabled] = useState(false);
  return (
    <>
      <div ref={ref} role="toolbar" onKeyDown={onKeyDown}>
        <button type="button" disabled={!undoEnabled}>
          Undo
        </button>
        <button type="button">Style</button>
        <button type="button">Bold</button>
      </div>
      <button type="button" onClick={() => setUndoEnabled((value) => !value)}>
        Toggle undo
      </button>
    </>
  );
}

const tabStop = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.closest('[role=toolbar]') && button.tabIndex === 0)
    .map((button) => button.textContent);

describe('useRovingToolbar', () => {
  beforeEach(() => {
    // jsdom has no layout; every control counts as rendered.
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
  });
  afterEach(() => vi.restoreAllMocks());

  it('enters on the first control until the user picks another one', async () => {
    render(<Toolbar />);
    expect(tabStop()).toEqual(['Style']);
    // Undo becomes available: it is the entry point again.
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toggle undo' })));
    expect(tabStop()).toEqual(['Undo']);

    // A control the user moved to stays the entry point.
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Undo' }), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bold' }));
    expect(tabStop()).toEqual(['Bold']);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toggle undo' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toggle undo' })));
    expect(tabStop()).toEqual(['Bold']);
  });
});
