import { describe, expect, it } from 'vitest';
import { normalizeImageUrl, sanitizeAltText, validateImageFile } from './media';

describe('media helpers', () => {
  it('accepts http image URLs and rejects unsafe protocols', () => {
    expect(normalizeImageUrl('https://example.com/image.png')).toEqual({
      ok: true,
      url: 'https://example.com/image.png',
    });
    expect(normalizeImageUrl('javascript:alert(1)')).toEqual({
      ok: false,
      code: 'invalid-protocol',
    });
    expect(normalizeImageUrl('   ')).toEqual({ ok: false, code: 'empty' });
    expect(normalizeImageUrl('not a url')).toEqual({ ok: false, code: 'invalid-url' });
  });

  it('validates image files by MIME type and size', () => {
    expect(validateImageFile(new File(['x'], 'image.png', { type: 'image/png' }))).toEqual({
      ok: true,
    });
    expect(validateImageFile(new File(['x'], 'note.txt', { type: 'text/plain' }))).toEqual({
      ok: false,
      code: 'not-image',
    });
  });

  it('normalizes alt text without inventing content', () => {
    expect(sanitizeAltText('  Example image  ')).toBe('Example image');
    expect(sanitizeAltText()).toBe('');
  });
});

describe('persistent image input', () => {
  it('rejects malformed data URLs and embedded credentials', () => {
    expect(normalizeImageUrl('data:image/png,<script>bad</script>')).toMatchObject({ ok: false });
    expect(normalizeImageUrl('data:image/png;base64,a')).toMatchObject({ ok: false });
    expect(normalizeImageUrl('https://user:password@example.com/private.png')).toMatchObject({
      ok: false,
    });
  });
  it('keeps browser-supported AVIF uploads valid through the image input contract', () => {
    expect(validateImageFile(new File(['image'], 'image.avif', { type: 'image/avif' }))).toEqual({
      ok: true,
    });
    expect(normalizeImageUrl('data:image/avif;base64,YQ==')).toMatchObject({ ok: true });
  });
  it('applies the same size limit to data URLs as file uploads', () => {
    expect(normalizeImageUrl(`data:image/png;base64,${'A'.repeat(14 * 1024 * 1024)}`)).toEqual({
      ok: false,
      code: 'too-large',
    });
  });
});
