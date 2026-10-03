import { describe, expect, it } from 'vitest';
import { FONT_SIZES, stepFontSize } from './toolbarModel';

describe('stepFontSize', () => {
  it('moves one step through the toolbar scale', () => {
    expect(stepFontSize('16px', 1)).toBe('18px');
    expect(stepFontSize('16px', -1)).toBe('14px');
    expect(stepFontSize('36px', 1)).toBe('48px');
  });

  it('snaps imported sizes that are not on the scale to the next step', () => {
    expect(stepFontSize('17px', 1)).toBe('18px');
    expect(stepFontSize('17px', -1)).toBe('16px');
    expect(stepFontSize('13.5px', 1)).toBe('14px');
  });

  it('stays within the scale at both ends', () => {
    expect(stepFontSize(FONT_SIZES[0], -1)).toBe('10px');
    expect(stepFontSize(FONT_SIZES[FONT_SIZES.length - 1], 1)).toBe('48px');
    expect(stepFontSize('96px', 1)).toBe('48px');
  });

  it('treats unreadable sizes as the default size', () => {
    expect(stepFontSize('large', 1)).toBe('18px');
    expect(stepFontSize('', -1)).toBe('14px');
  });
});
