import { useEffect } from 'react';

/** Smaller differences are browser toolbars collapsing, not a software keyboard. */
const KEYBOARD_THRESHOLD_PX = 120;

/**
 * Mirrors the visual viewport into CSS custom properties on `<html>` so fixed
 * chrome and sheets can stay above a software keyboard. Browsers shrink the
 * visual viewport (not the layout viewport) when the keyboard opens, so
 * `100dvh` and `bottom: 0` alone would place controls behind it.
 *
 * - `--app-viewport-height`: height of the visible area.
 * - `--keyboard-inset`: layout-viewport area hidden at the bottom.
 * - `data-keyboard-open`: set while a software keyboard covers the page.
 */
export function useVisualViewportVars(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let frame = 0;

    const update = () => {
      frame = 0;
      const zoomed = viewport ? viewport.scale > 1.01 : false;
      const height = viewport && !zoomed ? viewport.height : window.innerHeight;
      const inset =
        viewport && !zoomed
          ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
          : 0;
      root.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
      root.style.setProperty('--keyboard-inset', `${inset}px`);
      root.toggleAttribute('data-keyboard-open', inset > KEYBOARD_THRESHOLD_PX);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      root.style.removeProperty('--app-viewport-height');
      root.style.removeProperty('--keyboard-inset');
      root.removeAttribute('data-keyboard-open');
    };
  }, []);
}
