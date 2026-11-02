import { describe, expect, it } from 'vitest';
import { bidiLevels, directionalRuns, hasRtlText, reorderByLevels } from './bidi';

const visual = (text: string, base: 'ltr' | 'rtl') => {
  const characters = Array.from(text);
  const levels = bidiLevels(text, base);
  return reorderByLevels(characters, levels).join('');
};

describe('bidiLevels', () => {
  it('keeps Latin text at level 0 and RTL text at level 1 in an LTR paragraph', () => {
    expect(bidiLevels('abc', 'ltr')).toEqual([0, 0, 0]);
    expect(bidiLevels('مرحبا', 'ltr')).toEqual([1, 1, 1, 1, 1]);
  });

  it('embeds numbers in the surrounding RTL run so they keep their digit order', () => {
    expect(bidiLevels('مرحبا 123', 'ltr')).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2]);
    expect(visual('مرحبا 123', 'ltr')).toBe('123 ابحرم');
  });

  it('keeps Latin text left-to-right inside an RTL paragraph', () => {
    expect(bidiLevels('abc', 'rtl')).toEqual([2, 2, 2]);
    expect(visual('abc', 'rtl')).toBe('abc');
  });

  it('keeps mixed Latin and Arabic runs in their logical order around each other', () => {
    expect(visual('abc مرحبا xyz', 'ltr')).toBe('abc ابحرم xyz');
    expect(visual('abc مرحبا xyz', 'rtl')).toBe('xyz ابحرم abc');
  });

  it('treats combining marks as part of their base character', () => {
    const levels = bidiLevels('م\u064e', 'ltr');
    expect(levels).toEqual([1, 1]);
  });
});

describe('directionalRuns', () => {
  it('splits text at direction changes for shaping', () => {
    expect(directionalRuns('abc مرحبا', 'ltr')).toEqual([
      { start: 0, end: 4, direction: 'ltr' },
      { start: 4, end: 9, direction: 'rtl' },
    ]);
  });
});

describe('hasRtlText', () => {
  it('detects right-to-left scripts', () => {
    expect(hasRtlText('مرحبا')).toBe(true);
    expect(hasRtlText('שלום')).toBe(true);
    expect(hasRtlText('Hello 123')).toBe(false);
  });
});
