import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

// Curated font list. These originate from Google Fonts, but LWrite self-hosts
// them under public/fonts and serves them from its own origin (see
// scripts/fetch-fonts.mjs), so picking a font makes no third-party request.
export const FONT_FAMILIES = [
  // Sans-serif
  { name: 'Inter', category: 'sans-serif' },
  { name: 'Roboto', category: 'sans-serif' },
  { name: 'Open Sans', category: 'sans-serif' },
  { name: 'Lato', category: 'sans-serif' },
  { name: 'Montserrat', category: 'sans-serif' },
  { name: 'Poppins', category: 'sans-serif' },
  { name: 'Nunito', category: 'sans-serif' },
  { name: 'Raleway', category: 'sans-serif' },
  { name: 'Ubuntu', category: 'sans-serif' },
  { name: 'Work Sans', category: 'sans-serif' },
  { name: 'Mulish', category: 'sans-serif' },
  { name: 'Quicksand', category: 'sans-serif' },
  { name: 'Rubik', category: 'sans-serif' },
  { name: 'Josefin Sans', category: 'sans-serif' },
  { name: 'DM Sans', category: 'sans-serif' },
  // Serif
  { name: 'Playfair Display', category: 'serif' },
  { name: 'Merriweather', category: 'serif' },
  { name: 'Lora', category: 'serif' },
  { name: 'Libre Baskerville', category: 'serif' },
  { name: 'PT Serif', category: 'serif' },
  { name: 'Crimson Text', category: 'serif' },
  { name: 'Noto Serif', category: 'serif' },
  { name: 'EB Garamond', category: 'serif' },
  { name: 'Bitter', category: 'serif' },
  { name: 'Cormorant Garamond', category: 'serif' },
  // Monospace
  { name: 'Fira Code', category: 'monospace' },
  { name: 'Source Code Pro', category: 'monospace' },
  { name: 'JetBrains Mono', category: 'monospace' },
  { name: 'IBM Plex Mono', category: 'monospace' },
  { name: 'Roboto Mono', category: 'monospace' },
  // Display
  { name: 'Abril Fatface', category: 'display' },
  { name: 'Lobster', category: 'display' },
  { name: 'Pacifico', category: 'display' },
  { name: 'Dancing Script', category: 'display' },
  { name: 'Caveat', category: 'display' },
  { name: 'Satisfy', category: 'display' },
  { name: 'Great Vibes', category: 'display' },
  // System fonts
  { name: 'Arial', category: 'system' },
  { name: 'Times New Roman', category: 'system' },
  { name: 'Georgia', category: 'system' },
  { name: 'Verdana', category: 'system' },
  { name: 'Courier New', category: 'system' },
];

// Fonts that need no stylesheet injection: OS system fonts, plus the interface
// fonts already loaded globally in index.html.
const PRELOADED_FONTS = new Set([
  'Arial',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Courier New',
  'DM Sans',
]);

/** Only bundled families may cause a network request. Unknown imported fonts use CSS fallback. */
export function loadFont(fontName: string) {
  const font = FONT_FAMILIES.find(
    (candidate) => candidate.name.toLowerCase() === fontName.toLowerCase(),
  );
  if (!font || PRELOADED_FONTS.has(font.name)) return;
  const slug = font.name.toLowerCase().replace(/\s+/g, '-');
  if (document.head.querySelector(`link[data-editor-font="${slug}"]`)) return;
  const link = document.createElement('link');
  link.dataset.editorFont = slug;
  link.href = `/fonts/${slug}.css`;
  link.rel = 'stylesheet';
  link.onerror = () => link.remove();
  document.head.appendChild(link);
}

export function loadDocumentFonts(doc: ProseMirrorNode) {
  const families = new Set<string>();
  doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === 'textStyle' && typeof mark.attrs.fontFamily === 'string') {
        families.add(mark.attrs.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
      }
    }
  });
  families.forEach(loadFont);
}
