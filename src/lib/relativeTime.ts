const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
];

/** Local calendar days from `now` to `date` (negative in the past). */
function calendarDays(date: Date, now: number): number {
  const day = (time: number) => {
    const value = new Date(time);
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  };
  return Math.round((day(date.getTime()) - day(now)) / 86_400_000);
}

/**
 * "5 minutes ago" for the last week, a short date and time before that.
 * Both come from `Intl`, so every interface language is covered.
 */
export function formatRecentDate(date: Date, locale: string, now = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  const age = Math.abs(seconds);
  if (age < 7 * 86_400) {
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (age < 60) return relative.format(0, 'second');
    const { unit, seconds: size } = UNITS.find((candidate) => age >= candidate.seconds)!;
    // "Yesterday" names a calendar day: 30 hours before 00:30 is two days ago.
    if (unit === 'day') return relative.format(calendarDays(date, now), 'day');
    return relative.format(Math.trunc(seconds / size), unit);
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
