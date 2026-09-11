import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl } from './links';

describe('link input', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'vbscript:unsafe',
    'https://user:password@example.com',
    'https://example.com\n/',
  ])('rejects unsafe link %s', (value) => {
    expect(normalizeLinkUrl(value)).toBeNull();
  });
  it.each([
    ['example.org', 'https://example.org/'],
    ['#section', '#section'],
    ['/privacy', '/privacy'],
    ['mailto:writer@example.org', 'mailto:writer@example.org'],
  ])('normalizes %s', (value, expected) => {
    expect(normalizeLinkUrl(value)).toBe(expected);
  });
});
