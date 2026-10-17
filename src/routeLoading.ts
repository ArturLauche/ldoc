import type { ComponentType } from 'react';
import { loadLocale, type Locale } from '@/lib/translations';

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

/** Legal pages are in German under their German paths, English otherwise. */
export function legalPageLocale(pathname: string): 'en' | 'de' {
  const path = pathname.toLowerCase().replace(/\/+$/, '');
  return path === '/datenschutz' || path === '/nutzung' ? 'de' : 'en';
}

/**
 * Loads the first page's module and every catalog its first render reads.
 * Settles either way: a failed chunk still mounts so the error boundary can
 * offer a reload, and a missing catalog falls back to English.
 */
export function preloadPage(pathname: string, interfaceLocale: Locale): Promise<unknown> {
  const key = routeKeyFor(pathname);
  const locales = new Set<Locale>([interfaceLocale]);
  if (key === 'privacy' || key === 'terms') locales.add(legalPageLocale(pathname));
  return Promise.allSettled([preloadRoute(key), ...Array.from(locales, loadLocale)]);
}
