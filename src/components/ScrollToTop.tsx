import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets the window scroll position on route changes. BrowserRouter keeps the
 * previous scroll offset across SPA navigations, so without this a legal page
 * opened from the editor footer could appear scrolled past its heading and
 * contact card. Must be rendered inside the router.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};
