import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { LocaleProvider } from '@/components/locale-provider';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { EditorRoute, NotFoundRoute, PrivacyRoute, TermsRoute } from './routes';
import { routeKeyFor } from './routeLoading';

/** Matches the static shell in the built HTML, so route changes do not flash. */
function RouteFallback() {
  const { pathname } = useLocation();
  const editor = routeKeyFor(pathname) === 'editor';
  return (
    <div className="boot-shell" aria-busy="true">
      <div className="boot-bar" />
      {editor ? (
        <>
          <div className="boot-toolbar" />
          <div className="boot-main">
            <div className="boot-page" />
          </div>
          <div className="boot-dock" />
        </>
      ) : null}
    </div>
  );
}

const App = () => (
  <ThemeProvider>
    <LocaleProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AppErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<EditorRoute />} />
              {/* Public privacy/terms pages. German aliases point at the same
              pages so /datenschutz and /nutzung also resolve. */}
              <Route path="/privacy" element={<PrivacyRoute />} />
              <Route path="/datenschutz" element={<PrivacyRoute />} />
              <Route path="/terms" element={<TermsRoute />} />
              <Route path="/nutzung" element={<TermsRoute />} />
              <Route path="*" element={<NotFoundRoute />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </LocaleProvider>
  </ThemeProvider>
);

export default App;
