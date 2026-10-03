import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useVisualViewportVars } from './useVisualViewport';

class FakeVisualViewport extends EventTarget {
  height = window.innerHeight;
  offsetTop = 0;
  scale = 1;
}

describe('useVisualViewportVars', () => {
  let viewport: FakeVisualViewport;

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
  });

  const root = () => document.documentElement;
  const flushFrame = () =>
    act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  it('publishes the visible height and no inset without a keyboard', () => {
    renderHook(() => useVisualViewportVars());
    expect(root().style.getPropertyValue('--app-viewport-height')).toBe(`${window.innerHeight}px`);
    expect(root().style.getPropertyValue('--keyboard-inset')).toBe('0px');
    expect(root()).not.toHaveAttribute('data-keyboard-open');
  });

  it('measures the area a software keyboard covers, including a panned viewport', async () => {
    renderHook(() => useVisualViewportVars());
    viewport.height = window.innerHeight - 320;
    viewport.offsetTop = 20;
    viewport.dispatchEvent(new Event('resize'));
    await flushFrame();
    expect(root().style.getPropertyValue('--app-viewport-height')).toBe(
      `${window.innerHeight - 320}px`,
    );
    expect(root().style.getPropertyValue('--keyboard-inset')).toBe('300px');
    expect(root()).toHaveAttribute('data-keyboard-open');
  });

  it('ignores browser toolbars collapsing and pinch zoom', async () => {
    renderHook(() => useVisualViewportVars());
    viewport.height = window.innerHeight - 60;
    viewport.dispatchEvent(new Event('resize'));
    await flushFrame();
    expect(root().style.getPropertyValue('--keyboard-inset')).toBe('60px');
    expect(root()).not.toHaveAttribute('data-keyboard-open');

    viewport.scale = 2;
    viewport.height = window.innerHeight / 2;
    viewport.dispatchEvent(new Event('resize'));
    await flushFrame();
    expect(root().style.getPropertyValue('--keyboard-inset')).toBe('0px');
  });

  it('removes its variables on unmount', () => {
    const { unmount } = renderHook(() => useVisualViewportVars());
    unmount();
    expect(root().style.getPropertyValue('--keyboard-inset')).toBe('');
    expect(root().style.getPropertyValue('--app-viewport-height')).toBe('');
  });
});
