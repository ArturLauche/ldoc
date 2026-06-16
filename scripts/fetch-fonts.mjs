// Downloads the web fonts used by LWrite from Google Fonts and self-hosts them
// under `public/fonts/` so the app makes no third-party font requests at
// runtime (see the privacy policy / "Web fonts" section).
//
// Run manually whenever the font set changes:
//
//   node scripts/fetch-fonts.mjs
//
// It needs network access to fonts.googleapis.com / fonts.gstatic.com, writes
// woff2 files to `public/fonts/files/`, and emits one CSS file per family
// (`public/fonts/<slug>.css`) with @font-face rules pointing at the local
// files. The generated output is committed; the build itself never touches the
// network. Only the `latin` and `latin-ext` subsets are kept to bound the
// repository size — characters outside them fall back to system fonts via the
// preserved `unicode-range`, exactly as when a browser blocks external fonts.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'fonts');
const FILES_DIR = path.join(OUT_DIR, 'files');

// A modern desktop Chrome UA so the css2 endpoint returns woff2 sources.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

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
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(FILES_DIR, { recursive: true });

  let totalFiles = 0;

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
    console.log(`${family}: ${faces.length} face(s)`);
  }

  console.log(`\nDone. ${FONTS.length} families, ${totalFiles} woff2 files.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
