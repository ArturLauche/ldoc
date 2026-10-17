import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initialLocale } from './lib/localePreference';
import { preloadPage } from './routeLoading';
import './index.css';

const mount = () => createRoot(document.getElementById('root')!).render(<App />);

// Keep the static page on screen until the first route can render in the
// right language, so it is replaced exactly once.
void preloadPage(window.location.pathname, initialLocale()).then(mount);
