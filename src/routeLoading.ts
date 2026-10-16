import type { ComponentType } from 'react';

/**
 * Route modules load on demand. The entry point preloads the route of the
 * first page before React mounts, so the static page (or the editor
 * skeleton) in the built HTML stays on screen until the real page replaces
 * it, without a loading fallback in between.
 */
export const routeLoaders = {
  editor: () => import('./pages/Index'),
  privacy: () => import('./pages/Privacy'),
  terms: () => import('./pages/Terms'),
  notFound: () => import('./pages/NotFound'),
} satisfies Record<string, () => Promise<{ default: ComponentType }>>;

export type RouteKey = keyof typeof routeLoaders;

const loaded: Partial<Record<RouteKey, ComponentType>> = {};

export function routeKeyFor(pathname: string): RouteKey {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path === '/') return 'editor';
  if (path === '/privacy' || path === '/datenschutz') return 'privacy';
  if (path === '/terms' || path === '/nutzung') return 'terms';
  return 'notFound';
}

export async function preloadRoute(key: RouteKey): Promise<void> {
  loaded[key] = (await routeLoaders[key]()).default;
}

/** The route's component once its module has loaded. */
export function readyRoute(key: RouteKey): ComponentType | undefined {
  return loaded[key];
}
