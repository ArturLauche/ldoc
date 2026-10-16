import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { preloadRoute, routeKeyFor } from './routeLoading';
import './index.css';

const mount = () => createRoot(document.getElementById('root')!).render(<App />);

// Keep the static page on screen until the first route can render; a failed
// chunk still mounts so the error boundary can offer a reload.
preloadRoute(routeKeyFor(window.location.pathname)).then(mount, mount);
