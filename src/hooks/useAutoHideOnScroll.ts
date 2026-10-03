import { useEffect, useState, type RefObject } from 'react';

const SCROLL_DELTA_PX = 8;

/**
 * Phone headers slide away while the reader scrolls (or types) down the
 * document and return on any upward scroll, near the top of the page, or when
 * something inside them takes focus or opens a menu.
 */
export function useAutoHideOnScroll(enabled: boolean, ref: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    let lastY = window.scrollY;
    let frame = 0;

    const evaluate = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      const pinned =
        !element ||
        element.contains(document.activeElement) ||
        element.querySelector('[aria-expanded="true"]') !== null;
      if (pinned || y <= element.offsetHeight) {
        setHidden(false);
        lastY = y;
      } else if (Math.abs(delta) >= SCROLL_DELTA_PX) {
        setHidden(delta > 0);
        lastY = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(evaluate);
    };
    const reveal = () => setHidden(false);

    // Start visible whenever hiding is (re-)enabled, e.g. after closing find.
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      reveal();
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    element?.addEventListener('focusin', reveal);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      element?.removeEventListener('focusin', reveal);
    };
  }, [enabled, ref]);

  return enabled && hidden;
}
