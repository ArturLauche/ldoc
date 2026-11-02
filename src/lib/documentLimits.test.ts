import { describe, expect, it } from 'vitest';
import { sanitizeDocumentWithinLimit } from './documentLimits';
import { sanitizeDocumentHtml } from './sanitizeDocumentHtml';

describe('sanitizeDocumentWithinLimit', () => {
  it('measures the markup that will be stored, not the raw input', () => {
    // The sanitizer adds a <tbody>, so raw and stored sizes differ.
    const raw = '<table><tr><td>Cell</td></tr></table>';
    const sanitized = sanitizeDocumentHtml(raw);
    expect(sanitized.length).toBeGreaterThan(raw.length);

    expect(() => sanitizeDocumentWithinLimit(raw, raw.length)).toThrow('too large');
    expect(sanitizeDocumentWithinLimit(raw, sanitized.length)).toBe(sanitized);
  });

  it('accepts ordinary documents within the default limit', () => {
    expect(sanitizeDocumentWithinLimit('<p>Hello</p>')).toBe('<p>Hello</p>');
  });
});
