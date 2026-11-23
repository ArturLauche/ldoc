/**
 * Minimal TrueType `cmap` reader: whether a font file contains glyphs for a
 * given set of code points. Used to keep exports from embedding a fallback
 * font that does not carry the characters that made them embed it.
 *
 * Table layout follows the OpenType specification: an `sfnt` header, then a
 * `cmap` table with platform subtables; binary-search format 4 (UCS-2) and
 * format 12 (UCS-4) cover everything a text document can ask for.
 */

const SFNT_TAGS = [0x00010000, 0x74727565, 0x4f54544f]; // 1.0, 'true', 'OTTO'

function u16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function collect(
  bytes: Uint8Array,
  subOffset: number,
  format: number,
  wanted: Set<number>,
  covered: Set<number>,
): void {
  if (format === 4 && subOffset + 14 <= bytes.length) {
    const segments = u16(bytes, subOffset + 6) / 2;
    for (let segment = 0; segment < segments; segment += 1) {
      const end = u16(bytes, subOffset + 14 + segment * 2);
      const start = subOffset + 16 + segments * 2 + segment * 2;
      if (start + 2 > bytes.length) continue;
      const first = u16(bytes, start);
      if (first === 0xffff) continue;
      for (const code of wanted) {
        if (code >= first && code <= end) covered.add(code);
      }
    }
  } else if (format === 12 && subOffset + 16 <= bytes.length) {
    const groups = u32(bytes, subOffset + 12);
    for (let group = 0; group < groups; group += 1) {
      const base = subOffset + 16 + group * 12;
      if (base + 12 > bytes.length) break;
      const first = u32(bytes, base);
      const last = u32(bytes, base + 4);
      for (const code of wanted) {
        if (code >= first && code <= last) covered.add(code);
      }
    }
  }
}

/** Which of `codePoints` the font file carries glyphs for. */
export function truetypeCovered(bytes: Uint8Array, codePoints: number[]): Set<number> {
  const covered = new Set<number>();
  if (bytes.length < 12 || codePoints.length === 0) return covered;
  if (!SFNT_TAGS.includes(u32(bytes, 0))) return covered;
  const wanted = new Set(codePoints);
  let remaining = wanted.size;
  const tables = u16(bytes, 4);
  for (let index = 0; index < tables && remaining > 0; index += 1) {
    const entry = 12 + index * 16;
    if (entry + 16 > bytes.length) break;
    if (u32(bytes, entry) !== 0x636d6170) continue; // 'cmap'
    const offset = u32(bytes, entry + 8);
    if (offset + 4 > bytes.length) continue;
    const subtables = u16(bytes, offset + 2);
    for (let sub = 0; sub < subtables && remaining > 0; sub += 1) {
      const record = offset + 4 + sub * 8;
      if (record + 8 > bytes.length) continue;
      const platform = u16(bytes, record);
      const encoding = u16(bytes, record + 2);
      if (platform !== 0 && platform !== 3) continue;
      if (platform === 3 && encoding !== 0 && encoding !== 1 && encoding !== 10) continue;
      const subOffset = offset + u32(bytes, record + 4);
      if (subOffset + 2 > bytes.length) continue;
      collect(bytes, subOffset, u16(bytes, subOffset), wanted, covered);
      remaining = wanted.size - covered.size;
    }
  }
  return covered;
}
