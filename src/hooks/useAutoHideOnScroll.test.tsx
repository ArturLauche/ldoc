import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useAutoHideOnScroll } from './useAutoHideOnScroll';

const flushFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

async function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  window.dispatchEvent(new Event('scroll'));
  await flushFrame();
}

function setup(enabled = true) {
  const header = document.createElement('header');
  Object.defineProperty(header, 'offsetHeight', { configurable: true, value: 48 });
  const button = document.createElement('button');
  header.append(button);
  document.body.append(header);
  const hook = renderHook(
    ({ on }) => {
      const ref = useRef<HTMLElement>(header);
      return useAutoHideOnScroll(on, ref);
    },
    { initialProps: { on: enabled } },
  );
  return { header, button, hook };
}

describe('useAutoHideOnScroll', () => {
  afterEach(async () => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('hides while scrolling down and returns on scroll up', async () => {
    const { hook } = setup();
    await flushFrame();
    await scrollTo(400);
    expect(hook.result.current).toBe(true);
    await scrollTo(380);
    expect(hook.result.current).toBe(false);
  });

  it('stays visible near the top of the page and when disabled', async () => {
    const { hook } = setup();
    await flushFrame();
    await scrollTo(40);
    expect(hook.result.current).toBe(false);
    await scrollTo(400);
    hook.rerender({ on: false });
    expect(hook.result.current).toBe(false);
  });

  it('stays visible while it holds focus or an open menu', async () => {
    const { button, hook } = setup();
    await flushFrame();
    button.setAttribute('aria-expanded', 'true');
    await scrollTo(400);
    expect(hook.result.current).toBe(false);
    button.removeAttribute('aria-expanded');
    await scrollTo(800);
    expect(hook.result.current).toBe(true);
    act(() => button.focus());
    expect(hook.result.current).toBe(false);
  });
});
