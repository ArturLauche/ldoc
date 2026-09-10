import { describe, expect, it } from 'vitest';
import { pageMetadata, safeSiteOrigin } from './siteMetadata';

describe('public metadata', () => {
  it('uses the supplied origin without carrying a former deployment URL', () => {
    const metadata = pageMetadata('/privacy', 'https://preview.example.org');
    expect(JSON.stringify(metadata)).toContain('https://preview.example.org/privacy');
    expect(JSON.stringify(metadata)).not.toContain('lwrite.app');
    expect(metadata.title).toBe('Privacy Policy | LWrite');
  });
  it('gives translated legal URLs their own language and canonical URL', () => {
    const metadata = pageMetadata('/datenschutz', 'https://write.leunos.com');
    expect(metadata).toMatchObject({
      language: 'de',
      ogLocale: 'de_DE',
      canonicalPath: '/datenschutz',
    });
    expect(metadata.alternates).toContainEqual({ hreflang: 'en', href: '/privacy' });
  });
  it('does not canonicalize unknown pages to the editor or expose stale structured data', () => {
    expect(pageMetadata('/missing', 'https://write.leunos.com')).toMatchObject({
      noIndex: true,
      canonicalPath: undefined,
      structuredData: undefined,
    });
  });
  it.each(['javascript:alert(1)', 'not a URL', 'https://user:password@example.org'])(
    'rejects invalid site configuration %s',
    (value) => {
      expect(safeSiteOrigin(value)).toBe('https://write.leunos.com');
    },
  );
});
