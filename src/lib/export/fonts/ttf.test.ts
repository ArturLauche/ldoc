import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { truetypeCovered } from './ttf';

const notoSans = new Uint8Array(readFileSync(resolve(process.cwd(), 'src/assets/fonts/NotoSans-Regular.ttf')));

describe('truetypeCovered', () => {
  it('finds latin, greek and cyrillic coverage', () => {
    expect(truetypeCovered(notoSans, [0x0041, 0x03b1, 0x044f]).size).toBe(3);
  });

  it('reports missing coverage for other scripts', () => {
    expect(truetypeCovered(notoSans, [0x0645, 0x03b1]).size).toBe(1);
  });

  it('rejects non-font bytes and unmapped code points', () => {
    expect(truetypeCovered(new Uint8Array([1, 2, 3, 4]), [0x41]).size).toBe(0);
    expect(truetypeCovered(notoSans, [0x1f600]).size).toBe(0);
    expect(truetypeCovered(notoSans, []).size).toBe(0);
  });
});
