import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('@/lib/translations');
  vi.resetModules();
});

it('mounts without a catalog whose download stalls', async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.doMock('@/lib/translations', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/translations')>()),
    loadLocale: () => new Promise(() => {}),
  }));
  const { LOCALE_PRELOAD_DEADLINE_MS, preloadPage } = await import('./routeLoading');
  let settled = false;
  void preloadPage('/terms', 'de').then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(LOCALE_PRELOAD_DEADLINE_MS - 1);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => expect(settled).toBe(true));
});
