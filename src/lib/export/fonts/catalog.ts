import { FONT_FAMILIES } from '@/lib/fonts';

/** Font the editor renders unstyled document text in (`--font-sans`). */
export const DEFAULT_DOCUMENT_FAMILY = 'DM Sans';
/**
 * Code uses the editor's system monospace stack, which ends in Courier New.
 * It is the one member every office suite and PDF viewer can reproduce.
 */
export const MONOSPACE_FAMILY = 'Courier New';

export type FontCategory = 'sans-serif' | 'serif' | 'monospace' | 'display' | 'script';

/** PDF base-14 families used for system fonts whose binaries a browser cannot read. */
export type StandardFamily = 'Helvetica' | 'Times' | 'Courier';

export type ResolvedFamily =
  | { kind: 'bundled'; name: string; slug: string; category: FontCategory }
  | {
      kind: 'system';
      name: string;
      category: FontCategory;
      standard: StandardFamily;
      /** The standard family shares the system font's metrics (Arial ↔ Helvetica). */
      metricCompatible: boolean;
    }
  | { kind: 'unknown'; name: string };

// Interface fonts that are self-hosted (index.html) but not offered in the picker.
const INTERFACE_FAMILIES: Array<{ name: string; category: FontCategory }> = [{ name: 'Crimson Pro', category: 'serif' }];

const SCRIPT_FAMILIES = new Set(['Lobster', 'Pacifico', 'Dancing Script', 'Caveat', 'Satisfy', 'Great Vibes']);

const SYSTEM_FAMILIES: Record<string, { category: FontCategory; standard: StandardFamily; metricCompatible: boolean }> = {
  arial: { category: 'sans-serif', standard: 'Helvetica', metricCompatible: true },
  helvetica: { category: 'sans-serif', standard: 'Helvetica', metricCompatible: true },
  verdana: { category: 'sans-serif', standard: 'Helvetica', metricCompatible: false },
  'times new roman': { category: 'serif', standard: 'Times', metricCompatible: true },
  times: { category: 'serif', standard: 'Times', metricCompatible: true },
  georgia: { category: 'serif', standard: 'Times', metricCompatible: false },
  'courier new': { category: 'monospace', standard: 'Courier', metricCompatible: true },
  courier: { category: 'monospace', standard: 'Courier', metricCompatible: true },
};

function categoryOf(name: string, category: string): FontCategory {
  if (SCRIPT_FAMILIES.has(name)) return 'script';
  if (category === 'serif' || category === 'monospace' || category === 'display') return category;
  return 'sans-serif';
}

const BUNDLED = new Map<string, { name: string; category: FontCategory }>();
[...FONT_FAMILIES.filter((font) => font.category !== 'system'), ...INTERFACE_FAMILIES].forEach((font) => {
  BUNDLED.set(font.name.toLowerCase(), { name: font.name, category: categoryOf(font.name, font.category) });
});
const SYSTEM_NAMES = new Map(
  FONT_FAMILIES.filter((font) => font.category === 'system').map((font) => [font.name.toLowerCase(), font.name]),
);

/** First family of a CSS `font-family` list, unquoted. */
export function primaryFamilyName(value: string | undefined | null): string {
  if (!value) return '';
  return value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').trim() ?? '';
}

export function slugForFamily(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

export function resolveFamily(value: string | undefined | null): ResolvedFamily {
  const name = primaryFamilyName(value) || DEFAULT_DOCUMENT_FAMILY;
  const key = name.toLowerCase();
  const bundled = BUNDLED.get(key);
  if (bundled) return { kind: 'bundled', name: bundled.name, slug: slugForFamily(bundled.name), category: bundled.category };
  const system = SYSTEM_FAMILIES[key];
  if (system) return { kind: 'system', name: SYSTEM_NAMES.get(key) ?? name, ...system };
  return { kind: 'unknown', name };
}

/** CSS generic family to append to exported stacks. */
export function cssGenericFamily(family: ResolvedFamily): string {
  if (family.kind === 'unknown') return 'sans-serif';
  if (family.category === 'script') return 'cursive';
  if (family.category === 'display') return 'serif';
  return family.category;
}

/** WordprocessingML / RTF / ODF generic font class. */
export function officeFontClass(family: ResolvedFamily): 'swiss' | 'roman' | 'modern' | 'script' | 'decorative' {
  if (family.kind === 'unknown') return 'swiss';
  switch (family.category) {
    case 'serif':
      return 'roman';
    case 'monospace':
      return 'modern';
    case 'script':
      return 'script';
    case 'display':
      return 'decorative';
    default:
      return 'swiss';
  }
}

export function isMonospaceFamily(family: ResolvedFamily): boolean {
  return family.kind !== 'unknown' && family.category === 'monospace';
}
