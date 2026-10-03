import { useCallback, useSyncExternalStore } from 'react';

/**
 * Phone-sized editing: narrow portrait screens, and touch screens with too
 * little height for stacked desktop chrome (phones in landscape). Tablets and
 * desktop windows keep the full top toolbar.
 */
export const COMPACT_LAYOUT_QUERY =
  '(max-width: 639px), (max-height: 500px) and (pointer: coarse) and (max-width: 1023px)';

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = getMediaQueryList(query);
      if (!list) return () => {};
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => getMediaQueryList(query)?.matches ?? false,
    () => false,
  );
}

export function useCompactLayout(): boolean {
  return useMediaQuery(COMPACT_LAYOUT_QUERY);
}
