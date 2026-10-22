import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.ProseMirror[contenteditable=true]')).toBeVisible();
}

async function chooseGerman(page: Page) {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: /^Language/ }).click();
  await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
}

test('a language that failed to download loads on the next try', async ({ page }) => {
  let failed = 0;
  // Browsers keep a failed dynamic import in their module map; the retry
  // must still reach the network.
  await page.route(/\/assets\/de-[\w-]+\.js(\?.*)?$/, (route) => {
    if (failed++ === 0) return route.abort('internetdisconnected');
    return route.continue();
  });
  await page.goto('/');
  await ready(page);

  await chooseGerman(page);
  await expect(page.getByText('This language could not be loaded.', { exact: false })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await chooseGerman(page);
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  expect(failed).toBe(2);
});

test('a saved language whose download fails shows English as English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lwrite-locale', 'ar'));
  await page.route(/\/assets\/ar-[\w-]+\.js(\?.*)?$/, (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await ready(page);
  await expect(page.getByRole('button', { name: 'Preferences' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});
