// Downloads the web fonts used by LWrite from Google Fonts and self-hosts them
// under `public/fonts/` so the app makes no third-party font requests at
// runtime (see the privacy policy / "Web fonts" section).
//
// Run manually whenever the font set changes:
//
//   node scripts/fetch-fonts.mjs
//
// It needs network access to fonts.googleapis.com / fonts.gstatic.com (for the
// fonts) and raw.githubusercontent.com/google/fonts (for the licenses). It
// writes woff2 files to `public/fonts/files/`, emits one CSS file per family
// (`public/fonts/<slug>.css`) with @font-face rules pointing at the local
// files, and saves each family's upstream license (with its copyright notice)
// to `public/fonts/licenses/<slug>.txt` so the notices ship with the binaries.
// The generated output is committed; the build itself never touches the
// network. Only the `latin` and `latin-ext` subsets are kept to bound the
// repository size — characters outside them fall back to system fonts via the
// preserved `unicode-range`, exactly as when a browser blocks external fonts.

import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'fonts');
const FILES_DIR = path.join(OUT_DIR, 'files');
const LICENSE_DIR = path.join(OUT_DIR, 'licenses');

// A modern desktop Chrome UA so the css2 endpoint returns woff2 sources.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

// Where the upstream open-source licenses live. OFL, Apache and the Ubuntu Font
// License all require their notice/terms to accompany any redistribution of the
// font binaries, so we bundle each family's license file next to the woff2s.
const GF_RAW = 'https://raw.githubusercontent.com/google/fonts/main';
const LICENSE_FOLDERS = [
  { folder: 'ofl', file: 'OFL.txt', label: 'SIL Open Font License 1.1' },
  { folder: 'ufl', file: 'UFL.txt', label: 'Ubuntu Font License 1.0' },
  { folder: 'apache', file: 'LICENSE.txt', label: 'Apache License 2.0' },
];

// UI fonts loaded on every page (index.html) — keep all weights index.html used.
// Picker fonts mirror the Google entries in src/components/Editor/FontPicker.tsx
// and request the same `wght@400;700` the picker used to.
const UI_WEIGHTS = [400, 500, 600, 700];
const PICKER_WEIGHTS = [400, 700];

const FONTS = [
  // Interface fonts (always loaded).
  { family: 'DM Sans', weights: UI_WEIGHTS },
  { family: 'Crimson Pro', weights: UI_WEIGHTS },
  // Editor font picker — sans-serif.
  { family: 'Inter', weights: PICKER_WEIGHTS },
  { family: 'Roboto', weights: PICKER_WEIGHTS },
  { family: 'Open Sans', weights: PICKER_WEIGHTS },
  { family: 'Lato', weights: PICKER_WEIGHTS },
  { family: 'Montserrat', weights: PICKER_WEIGHTS },
  { family: 'Poppins', weights: PICKER_WEIGHTS },
  { family: 'Nunito', weights: PICKER_WEIGHTS },
  { family: 'Raleway', weights: PICKER_WEIGHTS },
  { family: 'Ubuntu', weights: PICKER_WEIGHTS },
  { family: 'Work Sans', weights: PICKER_WEIGHTS },
  { family: 'Mulish', weights: PICKER_WEIGHTS },
  { family: 'Quicksand', weights: PICKER_WEIGHTS },
  { family: 'Rubik', weights: PICKER_WEIGHTS },
  { family: 'Josefin Sans', weights: PICKER_WEIGHTS },
  // Serif.
  { family: 'Playfair Display', weights: PICKER_WEIGHTS },
  { family: 'Merriweather', weights: PICKER_WEIGHTS },
  { family: 'Lora', weights: PICKER_WEIGHTS },
  { family: 'Libre Baskerville', weights: PICKER_WEIGHTS },
  { family: 'PT Serif', weights: PICKER_WEIGHTS },
  { family: 'Crimson Text', weights: PICKER_WEIGHTS },
  { family: 'Noto Serif', weights: PICKER_WEIGHTS },
  { family: 'EB Garamond', weights: PICKER_WEIGHTS },
  { family: 'Bitter', weights: PICKER_WEIGHTS },
  { family: 'Cormorant Garamond', weights: PICKER_WEIGHTS },
  // Monospace.
  { family: 'Fira Code', weights: PICKER_WEIGHTS },
  { family: 'Source Code Pro', weights: PICKER_WEIGHTS },
  { family: 'JetBrains Mono', weights: PICKER_WEIGHTS },
  { family: 'IBM Plex Mono', weights: PICKER_WEIGHTS },
  { family: 'Roboto Mono', weights: PICKER_WEIGHTS },
  // Display / handwriting.
  { family: 'Abril Fatface', weights: PICKER_WEIGHTS },
  { family: 'Lobster', weights: PICKER_WEIGHTS },
  { family: 'Pacifico', weights: PICKER_WEIGHTS },
  { family: 'Dancing Script', weights: PICKER_WEIGHTS },
  { family: 'Caveat', weights: PICKER_WEIGHTS },
  { family: 'Satisfy', weights: PICKER_WEIGHTS },
  { family: 'Great Vibes', weights: PICKER_WEIGHTS },
];

const slugify = (family) => family.toLowerCase().replace(/\s+/g, '-');

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Returns the body, or null on 404 (so callers can probe several locations).
async function fetchTextOrNull(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

// The family's directory name in the google/fonts repo (lowercase, alnum only).
const gfDir = (family) => family.toLowerCase().replace(/[^a-z0-9]/g, '');

// Download a family's upstream license file. OFL/UFL files already embed the
// copyright notice; for the generic Apache license we prepend the per-font
// copyright from METADATA.pb so attribution travels with the text.
async function fetchLicense(family) {
  const dir = gfDir(family);
  for (const { folder, file, label } of LICENSE_FOLDERS) {
    const text = await fetchTextOrNull(`${GF_RAW}/${folder}/${dir}/${file}`);
    if (text == null) continue;

    let body = text;
    if (folder === 'apache') {
      const meta = await fetchTextOrNull(`${GF_RAW}/${folder}/${dir}/METADATA.pb`);
      const copyrights = meta
        ? [...new Set([...meta.matchAll(/copyright:\s*"([^"]+)"/g)].map((m) => m[1]))]
        : [];
      if (copyrights.length > 0) {
        body = `${copyrights.join('\n')}\n\n${text}`;
      }
    }
    return { label, body };
  }
  throw new Error(`No license found in google/fonts for "${family}" (dir "${dir}")`);
}

// Parse the css2 response into { subset, family, style, weight, unicodeRange, src }.
function parseFaces(css) {
  const faces = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const subset = match[1];
    const body = match[2];
    const pick = (name) => {
      const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
      return m ? m[1].trim() : '';
    };
    const srcMatch = body.match(/src:\s*url\(([^)]+)\)/);
    faces.push({
      subset,
      family: pick('font-family').replace(/^['"]|['"]$/g, ''),
      style: pick('font-style') || 'normal',
      weight: pick('font-weight') || '400',
      unicodeRange: pick('unicode-range'),
      src: srcMatch ? srcMatch[1].trim() : '',
    });
  }
  return faces;
}

async function run() {
  // Clean only the generated artifacts so the hand-written README.md survives.
  await rm(FILES_DIR, { recursive: true, force: true });
  await rm(LICENSE_DIR, { recursive: true, force: true });
  for (const entry of await readdir(OUT_DIR).catch(() => [])) {
    if (entry.endsWith('.css')) {
      await rm(path.join(OUT_DIR, entry), { force: true });
    }
  }
  await mkdir(FILES_DIR, { recursive: true });
  await mkdir(LICENSE_DIR, { recursive: true });

  let totalFiles = 0;
  const licenseIndex = [];

  for (const { family, weights } of FONTS) {
    const familyParam = family.replace(/ /g, '+');
    const url =
      `https://fonts.googleapis.com/css2?family=${familyParam}:wght@` +
      `${weights.join(';')}&display=swap`;
    const css = await fetchText(url);
    const faces = parseFaces(css).filter((f) => KEEP_SUBSETS.has(f.subset));

    if (faces.length === 0) {
      throw new Error(`No latin faces parsed for "${family}" from ${url}`);
    }

    const slug = slugify(family);
    const cssBlocks = [];

    for (const face of faces) {
      const fileName = `${slug}-${face.weight}-${face.style}-${face.subset}.woff2`;
      const bytes = await fetchBinary(face.src);
      await writeFile(path.join(FILES_DIR, fileName), bytes);
      totalFiles += 1;

      cssBlocks.push(
        `@font-face {\n` +
          `  font-family: '${face.family}';\n` +
          `  font-style: ${face.style};\n` +
          `  font-weight: ${face.weight};\n` +
          `  font-display: swap;\n` +
          `  src: url('/fonts/files/${fileName}') format('woff2');\n` +
          `  unicode-range: ${face.unicodeRange};\n` +
          `}`,
      );
    }

    const header =
      `/* ${family} — self-hosted from Google Fonts (latin, latin-ext).\n` +
      `   Generated by scripts/fetch-fonts.mjs. Do not edit by hand. */\n`;
    await writeFile(
      path.join(OUT_DIR, `${slug}.css`),
      `${header}${cssBlocks.join('\n')}\n`,
    );

    const license = await fetchLicense(family);
    await writeFile(path.join(LICENSE_DIR, `${slug}.txt`), license.body);
    licenseIndex.push({ family, slug, label: license.label });

    console.log(`${family}: ${faces.length} face(s) — ${license.label}`);
  }

  licenseIndex.sort((a, b) => a.family.localeCompare(b.family));
  const indexBody =
    `# Font licenses\n\n` +
    `Each file in this directory is the upstream open-source license (including\n` +
    `the copyright notice) for the matching self-hosted family in \`../files\`.\n` +
    `These licenses require their terms and notices to accompany any\n` +
    `redistribution of the font binaries, so they are committed and shipped with\n` +
    `the build. Generated by \`scripts/fetch-fonts.mjs\` — do not edit by hand.\n\n` +
    `| Font | License | File |\n| --- | --- | --- |\n` +
    licenseIndex
      .map((e) => `| ${e.family} | ${e.label} | [\`${e.slug}.txt\`](./${e.slug}.txt) |`)
      .join('\n') +
    '\n';
  await writeFile(path.join(LICENSE_DIR, 'README.md'), indexBody);

  console.log(
    `\nDone. ${FONTS.length} families, ${totalFiles} woff2 files, ` +
      `${licenseIndex.length} license files.`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
