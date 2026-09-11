import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const routes = ['index', 'privacy', 'terms', 'datenschutz', 'nutzung', '404'];
const titles = new Set();
for (const route of routes) {
  const html = await readFile(`dist/${route}.html`, 'utf8');
  assert.equal([...html.matchAll(/<title>/g)].length, 1, `${route}: one title`);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1];
  assert(title && !titles.has(title), `${route}: unique title`);
  titles.add(title);
  assert.equal([...html.matchAll(/<h1[\s>]/g)].length, 1, `${route}: initial heading`);
  assert(html.includes('name="description"'), `${route}: description`);
  assert(html.includes('property="og:image"'), `${route}: share image`);
  assert(
    !html.includes('lwrite.app') && !html.includes('@LWrite'),
    `${route}: no obsolete identity`,
  );
  if (route === '404') {
    assert(html.includes('noindex,nofollow'), '404 is not indexable');
    assert(!html.includes('rel="canonical"'), '404 does not canonicalize to home');
  } else {
    assert(html.includes('rel="canonical"'), `${route}: canonical`);
    assert(html.includes('application/ld+json'), `${route}: structured data`);
  }
  const german = route === 'datenschutz' || route === 'nutzung';
  assert(html.includes(`lang="${german ? 'de' : 'en'}"`), `${route}: language`);
  for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    assert((await stat(join('dist', path))).isFile(), `${route}: linked asset ${path}`);
  }
}
const assets = await readdir('dist/assets');
assert(!assets.some((file) => file.endsWith('.map')), 'No public source maps');
for (const asset of [
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'og-image.png',
  'llms.txt',
  'robots.txt',
  'sitemap.xml',
]) {
  assert((await stat(`dist/${asset}`)).size > 0, `${asset} exists and is nonempty`);
}
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
assert.equal([...sitemap.matchAll(/<loc>/g)].length, 5, 'All five public paths are listed');
assert(!sitemap.includes('lwrite.app'), 'Sitemap uses current deployment identity');
console.log('Production output verified: routes, metadata, assets and source-map policy.');
