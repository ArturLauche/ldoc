// Share URLs for byte-identical font sources while preserving face descriptors
// and old asset URLs. Safe to run offline against the committed font catalog.
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function deduplicateFontSources(directory) {
  const canonicalSources = new Map();
  let changedSources = 0;
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.css')).sort()) {
    const file = path.join(directory, name);
    const original = await readFile(file, 'utf8');
    let css = original;
    for (const match of original.matchAll(/url\(['"]?(\/fonts\/files\/([\w.-]+\.woff2))['"]?\)/g)) {
      const [, url, filename] = match;
      const bytes = await readFile(path.join(directory, 'files', filename));
      const hash = createHash('sha256').update(bytes).digest('hex');
      const canonical = canonicalSources.get(hash) ?? url;
      canonicalSources.set(hash, canonical);
      if (url !== canonical) {
        css = css.replace(match[0], `url('${canonical}')`);
        changedSources += 1;
      }
    }
    if (css !== original) await writeFile(file, css);
  }
  return changedSources;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = fileURLToPath(new URL('../public/fonts/', import.meta.url));
  console.log(`Shared ${await deduplicateFontSources(directory)} duplicate font sources.`);
}
