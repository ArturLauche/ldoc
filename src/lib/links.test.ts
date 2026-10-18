import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl } from './links';

describe('link input', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'vbscript:unsafe',
    'https://user:password@example.com',
    'https://example.com\n/',
    'not a link with spaces',
    'https://exa mple.com/',
  ])('rejects unsafe link %s', (value) => {
    expect(normalizeLinkUrl(value)).toBeNull();
  });
  it.each([
    ['example.org', 'https://example.org/'],
    ['#section', '#section'],
    ['/privacy', '/privacy'],
    ['mailto:writer@example.org', 'mailto:writer@example.org'],
    // Spaces in the path are fine; they are only refused in the host.
    ['example.org/my file.pdf', 'https://example.org/my%20file.pdf'],
  ])('normalizes %s', (value, expected) => {
    expect(normalizeLinkUrl(value)).toBe(expected);
  });
});
