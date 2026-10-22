import { describe, expect, it } from 'vitest';
import { formatRecentDate } from './relativeTime';

const NOW = Date.parse('2026-10-16T12:00:00Z');

describe('recent dates', () => {
  it('describes the last week relatively', () => {
    expect(formatRecentDate(new Date(NOW - 20_000), 'en', NOW)).toBe('now');
    expect(formatRecentDate(new Date(NOW - 5 * 60_000), 'en', NOW)).toBe('5 minutes ago');
    expect(formatRecentDate(new Date(NOW - 3 * 3_600_000), 'en', NOW)).toBe('3 hours ago');
    expect(formatRecentDate(new Date(NOW - 86_400_000), 'en', NOW)).toBe('yesterday');
    expect(formatRecentDate(new Date(NOW - 2 * 3_600_000), 'de', NOW)).toBe('vor 2 Stunden');
  });

  it('names calendar days, not elapsed 24-hour spans', () => {
    // Wednesday 00:30 local time.
    const now = new Date(2026, 9, 14, 0, 30).getTime();
    expect(formatRecentDate(new Date(2026, 9, 12, 18, 30), 'en', now)).toBe('2 days ago');
    expect(formatRecentDate(new Date(2026, 9, 12, 18, 30), 'de', now)).toBe('vorgestern');
    expect(formatRecentDate(new Date(2026, 9, 13, 0, 15), 'en', now)).toBe('yesterday');
    expect(formatRecentDate(new Date(2026, 9, 13, 20, 0), 'en', now)).toBe('4 hours ago');
  });

  it('shows a date for older entries', () => {
    expect(formatRecentDate(new Date('2026-09-01T12:00:00Z'), 'en', NOW)).toMatch(/Sep 1, 2026/);
  });
});
