import type { Plugin } from 'vite';
import { createLegalCopies, type LegalCopy } from '../src/lib/legalContent';
import {
  DEFAULT_SITE_URL,
  PUBLIC_PATHS,
  pageMetadata,
  safeSiteOrigin,
} from '../src/lib/siteMetadata';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const HEAD_START = '<!-- route-head:start -->';
const HEAD_END = '<!-- route-head:end -->';
const BODY_START = '<!-- route-body:start -->';
const BODY_END = '<!-- route-body:end -->';

/** Generate static HTML for existing routes. No server rendering or runtime service. */
export function staticPages(env: Record<string, string>): Plugin {
  const previewUrl =
    env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main' ? env.CF_PAGES_URL : undefined;
  const origin = safeSiteOrigin(env.VITE_SITE_URL || previewUrl, DEFAULT_SITE_URL);
  const siteName = env.VITE_SITE_NAME?.trim() || 'LWrite';
  const lastUpdated = env.VITE_LEGAL_LAST_UPDATED?.trim() || '2026-06-16';
  const jurisdiction = env.VITE_LEGAL_JURISDICTION?.trim() || 'Germany / EU';
  const copies = createLegalCopies({ siteName, siteUrl: origin, jurisdiction });

  const contact = (copy: LegalCopy) => {
    const email = env.VITE_LEGAL_CONTACT_EMAIL?.trim();
    const name = env.VITE_LEGAL_CONTROLLER_NAME?.trim();
    let contactUrl = '';
    try {
      const url = new URL(env.VITE_LEGAL_CONTACT_URL ?? '');
      if (['https:', 'http:'].includes(url.protocol)) contactUrl = url.href;
    } catch {
      /* Optional contact URL. */
    }
    return `<section><h2>${escape(copy.contactHeading)}</h2>${name ? `<p>${escape(name)}</p>` : ''}${email ? `<p>${escape(email)}</p>` : ''}${contactUrl ? `<p><a href="${escape(contactUrl)}">${escape(copy.contactUrlLabel)}</a></p>` : ''}${!email && !contactUrl ? `<p>${escape(copy.contactPlaceholder)}</p>` : ''}<p>${escape(copy.jurisdictionLabel)}: ${escape(jurisdiction)}</p></section>`;
  };

  const headFor = (path: string) => {
    const metadata = pageMetadata(path, origin, siteName, lastUpdated);
    const image = new URL('/og-image.png', origin).href;
    const url = new URL(path, origin).href;
    const meta = (name: string, content: string, property = false) =>
      `<meta ${property ? 'property' : 'name'}="${name}" content="${escape(content)}" />`;
    return [
      `<title>${escape(metadata.title)}</title>`,
      meta('description', metadata.description),
      meta('robots', metadata.noIndex ? 'noindex,nofollow' : 'index,follow'),
      ...(!metadata.noIndex
        ? [`<link rel="canonical" href="${escape(url)}" />`, meta('og:url', url, true)]
        : []),
      meta('og:site_name', siteName, true),
      meta('og:type', 'website', true),
      meta('og:title', metadata.title, true),
      meta('og:description', metadata.description, true),
      meta('og:locale', metadata.ogLocale, true),
      ...metadata.ogLocaleAlternates.map((locale) => meta('og:locale:alternate', locale, true)),
      meta('og:image', image, true),
      meta('og:image:width', '1200', true),
      meta('og:image:height', '630', true),
      meta('og:image:type', 'image/png', true),
      meta('og:image:alt', `${siteName} – private online rich text editor`, true),
      meta('twitter:card', 'summary_large_image'),
      meta('twitter:title', metadata.title),
      meta('twitter:description', metadata.description),
      meta('twitter:image', image),
      meta('twitter:image:alt', `${siteName} – private online rich text editor`),
      ...metadata.alternates.map(
        (alternate) =>
          `<link rel="alternate" hreflang="${alternate.hreflang}" href="${escape(new URL(alternate.href, origin).href)}" />`,
      ),
      ...(metadata.structuredData
        ? [
            `<script type="application/ld+json" id="ldoc-structured-data">${jsonLd(metadata.structuredData)}</script>`,
          ]
        : []),
    ].join('\n    ');
  };

  const bodyFor = (path: string) => {
    if (path === '/')
      return `<div id="root"></div><noscript><main class="mx-auto max-w-3xl p-6"><h1>${escape(siteName)} – Private rich text editor</h1><p>Enable JavaScript to write, format and export documents. Documents are stored in this browser; no account is required.</p><nav><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a></nav></main></noscript>`;
    const copy =
      path === '/privacy'
        ? copies.privacyEn
        : path === '/datenschutz'
          ? copies.privacyDe
          : path === '/terms'
            ? copies.termsEn
            : path === '/nutzung'
              ? copies.termsDe
              : null;
    if (!copy)
      return `<div id="root"><main class="mx-auto max-w-3xl p-6"><h1>Page not found</h1><p>The page you requested could not be found.</p><a href="/">Return to the editor</a></main></div>`;
    return `<div id="root"><main class="prose mx-auto max-w-3xl px-5 py-10"><nav><a href="/">${escape(siteName)}</a></nav><h1>${escape(copy.title)}</h1><p>${escape(copy.lastUpdatedLabel)}: ${escape(lastUpdated)}</p><p>${escape(copy.intro)}</p>${contact(copy)}${copy.blocks.map((block) => `<section><h2>${escape(block.heading)}</h2>${(block.paragraphs ?? []).map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}${block.bullets ? `<ul>${block.bullets.map((bullet) => `<li>${escape(bullet)}</li>`).join('')}</ul>` : ''}</section>`).join('')}</main></div>`;
  };

  const render = (html: string, path: string) =>
    html
      .replace(/<html lang="[^"]*"/, `<html lang="${pageMetadata(path, origin).language}"`)
      .replace(
        new RegExp(`${HEAD_START}[\\s\\S]*?${HEAD_END}`),
        `${HEAD_START}\n    ${headFor(path)}\n    ${HEAD_END}`,
      )
      .replace(
        new RegExp(`${BODY_START}[\\s\\S]*?${BODY_END}`),
        `${BODY_START}\n    ${bodyFor(path)}\n    ${BODY_END}`,
      );

  return {
    name: 'lwrite-static-pages',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: { order: 'post', handler: (html) => render(html, '/') },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset' || typeof index.source !== 'string')
          throw new Error('Missing built index.html.');
        for (const path of [...PUBLIC_PATHS.filter((path) => path !== '/'), '/404']) {
          this.emitFile({
            type: 'asset',
            fileName: `${path.slice(1)}.html`,
            source: render(index.source, path),
          });
        }
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map((path) => `  <url><loc>${escape(new URL(path, origin).href)}</loc></url>`).join('\n')}\n</urlset>\n`,
        });
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
        });
      },
    },
  };
}
