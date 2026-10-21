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

/** How long the first render waits for a catalog; a later one switches the language when it arrives. */
export const LOCALE_PRELOAD_DEADLINE_MS = 4000;

/**
 * Loads the first page's module and every catalog its first render reads.
 * Settles either way: a failed chunk still mounts so the error boundary can
 * offer a reload, and a missing or stalled catalog falls back to English.
 */
export function preloadPage(pathname: string, interfaceLocale: Locale): Promise<unknown> {
  const key = routeKeyFor(pathname);
  const locales = new Set<Locale>([interfaceLocale]);
  if (key === 'privacy' || key === 'terms') locales.add(legalPageLocale(pathname));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(resolve, LOCALE_PRELOAD_DEADLINE_MS);
  });
  const catalogs = Promise.allSettled(Array.from(locales, loadLocale));
  const ready = Promise.race([catalogs, deadline]).finally(() => clearTimeout(timer));
  return Promise.allSettled([preloadRoute(key), ready]);
}
