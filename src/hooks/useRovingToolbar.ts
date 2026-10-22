import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react';

const ITEM_SELECTOR = 'button, [role="combobox"], input, select';

function toolbarItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter(
    (item) =>
      !item.hasAttribute('disabled') &&
      item.getAttribute('aria-hidden') !== 'true' &&
      // Collapsed groups (`display: none`) are not part of the sequence.
      item.getClientRects().length > 0,
  );
}

/**
 * WAI-ARIA toolbar keyboard model: the toolbar is one tab stop, arrow keys
 * (Home/End) move between its controls, and the control the user last
 * focused stays the entry point (the first control until then, including
 * one that was disabled when the toolbar appeared). Popovers and menus
 * opened from it keep their own keys.
 */
export function useRovingToolbar(ref: RefObject<HTMLElement | null>) {
  const normalize = useCallback(
    (focused?: HTMLElement | null) => {
      const root = ref.current;
      if (!root) return;
      const items = toolbarItems(root);
      const chosen = focused && items.includes(focused) ? focused : null;
      const current =
        chosen ?? items.find((item) => item.dataset.rovingChosen === 'true') ?? items[0];
      for (const item of root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
        item.tabIndex = item === current ? 0 : -1;
        if (chosen) {
          if (item === chosen) item.dataset.rovingChosen = 'true';
          else delete item.dataset.rovingChosen;
        }
      }
    },
    [ref],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    normalize();
    // Contextual controls come and go with the selection.
    const observer = new MutationObserver(() => normalize());
    observer.observe(root, { childList: true, subtree: true, attributeFilter: ['disabled', 'class'] });
    // Breakpoints hide groups without touching the DOM: if the entry point
    // is among them, the toolbar would drop out of the Tab order.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => normalize());
    resizeObserver?.observe(root);
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches(ITEM_SELECTOR)) normalize(event.target);
    };
    root.addEventListener('focusin', onFocusIn);
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      root.removeEventListener('focusin', onFocusIn);
    };
  }, [normalize, ref]);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const root = ref.current;
      if (!root || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (!(event.target instanceof HTMLElement) || event.target.matches('input, select, textarea')) return;
      const items = toolbarItems(root);
      const index = items.indexOf(event.target);
      if (index < 0) return;
      const rtl = getComputedStyle(root).direction === 'rtl';
      const next: Record<string, number> = {
        ArrowRight: rtl ? index - 1 : index + 1,
        ArrowLeft: rtl ? index + 1 : index - 1,
        Home: 0,
        End: items.length - 1,
      };
      if (!(event.key in next)) return;
      event.preventDefault();
      const target = items[(next[event.key] + items.length) % items.length];
      target?.focus();
    },
    [ref],
  );
}
