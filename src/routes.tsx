import { lazy, type ComponentType } from 'react';
import { readyRoute, routeLoaders, type RouteKey } from './routeLoading';

/** Renders a preloaded route directly; other routes suspend while they load. */
function routeComponent(key: RouteKey): ComponentType {
  const Lazy = lazy(routeLoaders[key]);
  function Route() {
    const Ready = readyRoute(key);
    return Ready ? <Ready /> : <Lazy />;
  }
  Route.displayName = `Route(${key})`;
  return Route;
}

export const EditorRoute = routeComponent('editor');
export const PrivacyRoute = routeComponent('privacy');
export const TermsRoute = routeComponent('terms');
export const NotFoundRoute = routeComponent('notFound');
