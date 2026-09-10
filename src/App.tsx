import { ThemeProvider } from '@/components/theme-provider';
import { LocaleProvider } from '@/components/locale-provider';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ScrollToTop } from '@/components/ScrollToTop';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { lazy, Suspense } from 'react';
const Index = lazy(() => import('./pages/Index'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const NotFound = lazy(() => import('./pages/NotFound'));

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <LocaleProvider>
      <BrowserRouter>
        <ScrollToTop />
        <AppErrorBoundary>
          <Suspense
            fallback={
              <main className="mx-auto max-w-3xl px-5 py-14" aria-busy="true">
                <div className="h-8 w-48 rounded-sm bg-muted" />
              </main>
            }
          >
            <Routes>
              <Route path="/" element={<Index />} />
              {/* Public privacy/terms pages. German aliases point at the same
              pages so /datenschutz and /nutzung also resolve. */}
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/datenschutz" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/nutzung" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </LocaleProvider>
  </ThemeProvider>
);

export default App;
