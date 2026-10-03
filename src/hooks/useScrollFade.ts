import { useCallback } from 'react';

/**
 * Ref callback for horizontally scrolling strips. Marks the element with
 * `data-more-before` / `data-more-after` while content is clipped on that
 * side, so CSS can fade the edge and signal that the strip scrolls.
 */
export function useScrollFade<T extends HTMLElement>() {
  return useCallback((element: T | null) => {
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = element.scrollWidth - element.clientWidth;
      // RTL strips report a negative scrollLeft.
      const position = Math.abs(element.scrollLeft);
      element.toggleAttribute('data-more-before', max > 2 && position > 2);
      element.toggleAttribute('data-more-after', max > 2 && position < max - 2);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    element.addEventListener('scroll', schedule, { passive: true });
    // Size changes of the strip itself, and contents appearing or changing
    // (contextual tools, translated labels) both change what is clipped.
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(element);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      element.removeEventListener('scroll', schedule);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);
}
