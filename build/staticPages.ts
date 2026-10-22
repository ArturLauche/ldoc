import type { Plugin, Rollup } from 'vite';
import de from '../src/lib/locales/de.ts';
import { translateFrom, type TranslationKey } from '../src/lib/translations.ts';
import { createLegalCopies, type LegalCopy } from '../src/lib/legalContent.ts';
import {
  DEFAULT_SITE_URL,
  PUBLIC_PATHS,
  pageMetadata,
  safeSiteOrigin,
} from '../src/lib/siteMetadata.ts';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
/** Static pages are in English or German, so only those catalogs are needed here. */
const t = (locale: 'en' | 'de', key: TranslationKey) =>
  translateFrom(locale === 'de' ? de : undefined, key);
/** lucide-react's Mail icon, as ObfuscatedEmail renders it. */
const MAIL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail h-3.5 w-3.5" aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>';
const jsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
const HEAD_START = '<!-- route-head:start -->';
const HEAD_END = '<!-- route-head:end -->';
const BODY_START = '<!-- route-body:start -->';
const BODY_END = '<!-- route-body:end -->';
const PRELOAD_START = '<!-- editor-preload:start -->';
const PRELOAD_END = '<!-- editor-preload:end -->';

/** Lazy modules the editor needs on its first render (its static imports come along). */
const EDITOR_MODULES = ['/src/pages/Index.tsx', '/src/components/Editor/FileMenu.tsx'];

/**
 * Module preloads for the editor route: the browser fetches the editor
 * chunks alongside the entry script instead of after it has run. Low
 * priority keeps the stylesheet and entry first on slow connections
 * (measured: about 3% faster to an editable document at 1.6 Mbit/s and
 * 150 ms RTT, 6–11% at 10 Mbit/s and 40 ms). Only `index.html` gets them;
 * legal pages do not load the editor.
 */
function editorPreloads(
  bundle: Rollup.OutputBundle | undefined,
  entry: Rollup.OutputChunk | undefined,
): string {
  if (!bundle) return '';
  const chunks = Object.values(bundle).filter((item): item is Rollup.OutputChunk => item.type === 'chunk');
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const alreadyLoaded = new Set<string>();
  const collect = (fileName: string, into: Set<string>) => {
    if (into.has(fileName)) return;
    into.add(fileName);
    byName.get(fileName)?.imports.forEach((next) => collect(next, into));
  };
  if (entry) collect(entry.fileName, alreadyLoaded);
  const files = new Set<string>();
  for (const chunk of chunks) {
    if (EDITOR_MODULES.some((module) => chunk.facadeModuleId?.endsWith(module))) {
      collect(chunk.fileName, files);
    }
  }
  const links = [...files]
    .filter((file) => !alreadyLoaded.has(file))
    .map((file) => `<link rel="modulepreload" crossorigin fetchpriority="low" href="/${file}" />`);
  return links.length ? `${PRELOAD_START}\n    ${links.join('\n    ')}\n    ${PRELOAD_END}` : '';
}

/** Generate static HTML for existing routes. No server rendering or runtime service. */
export function staticPages(env: Record<string, string>): Plugin {
  const previewUrl =
    env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main' ? env.CF_PAGES_URL : undefined;
  const origin = safeSiteOrigin(env.VITE_SITE_URL || previewUrl, DEFAULT_SITE_URL);
  const siteName = env.VITE_SITE_NAME?.trim() || 'LWrite';
  const lastUpdated = env.VITE_LEGAL_LAST_UPDATED?.trim() || '2026-06-16';
  const jurisdiction = env.VITE_LEGAL_JURISDICTION?.trim() || 'Germany / EU';
  const copies = createLegalCopies({ siteName, siteUrl: origin, jurisdiction });

  /**
   * Like ObfuscatedEmail: the button reveals the address once the app runs,
   * so it is never in the HTML as a plain address. Visitors without
   * JavaScript, who only ever get this page, still need a way to write: for
   * them it is spelled out with "[at]", a light obfuscation like the bundle's.
   * An implausible address is shown verbatim, as ObfuscatedEmail does.
   */
  const emailMarkup = (email: string, locale: 'en' | 'de') => {
    const at = email.lastIndexOf('@');
    if (at <= 0 || at === email.length - 1) return escape(email);
    return `<button type="button" class="reveal-email inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:decoration-solid" title="${escape(t(locale, 'revealEmailHint'))}">${MAIL_ICON}${escape(t(locale, 'revealEmail'))}</button><noscript><style>.reveal-email{display:none!important}</style>${escape(email.slice(0, at))} [at] ${escape(email.slice(at + 1))}</noscript>`;
  };

  /** The contact card of LegalPageLayout. */
  const contact = (copy: LegalCopy, locale: 'en' | 'de') => {
    const email = env.VITE_LEGAL_CONTACT_EMAIL?.trim();
    const name = env.VITE_LEGAL_CONTROLLER_NAME?.trim();
    let contactUrl = '';
    try {
      const url = new URL(env.VITE_LEGAL_CONTACT_URL ?? '');
      if (['https:', 'http:'].includes(url.protocol)) contactUrl = url.href;
    } catch {
      /* Optional contact URL. */
    }
    const item = (label: string, value: string) =>
      `<li><span class="text-muted-foreground">${escape(label)}:</span> ${value}</li>`;
    const details =
      email || contactUrl
        ? `<ul class="space-y-1 text-sm">${name ? item(copy.contactNameLabel, escape(name)) : ''}${email ? item(copy.contactEmailLabel, emailMarkup(email, locale)) : ''}${contactUrl ? item(copy.contactUrlLabel, `<a class="underline" href="${escape(contactUrl)}" target="_blank" rel="noreferrer">${escape(contactUrl)}</a>`) : ''}</ul>`
        : `<div class="space-y-2"><p class="text-sm text-muted-foreground">${escape(copy.contactPlaceholder)}</p></div>`;
    return `<section class="not-prose my-6 border-y border-border py-5 text-card-foreground"><h2 class="mb-2 text-base font-semibold">${escape(copy.contactHeading)}</h2>${details}<p class="mt-3 text-sm"><span class="text-muted-foreground">${escape(copy.jurisdictionLabel)}:</span> ${escape(jurisdiction)}</p></section>`;
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

  const legalHeader = (locale: 'en' | 'de') =>
    `<header class="app-bar sticky top-0 z-40"><div class="mx-auto flex h-12 w-full max-w-3xl items-center justify-between px-5"><a href="/" class="flex min-w-0 items-center gap-2 rounded-sm"><img src="/favicon.svg" alt="" width="20" height="20" class="h-5 w-5 shrink-0 rounded-[0.35rem]" /><span class="truncate text-sm font-semibold tracking-tight">${escape(siteName)}</span></a><a href="/" aria-label="${escape(t(locale, 'legalBackToEditor'))}" class="-me-2 flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg><span class="hidden sm:inline">${escape(t(locale, 'legalBackToEditor'))}</span></a></div></header>`;

  const legalFooter = (locale: 'en' | 'de') =>
    `<footer class="legal-footer"><nav aria-label="${escape(t(locale, 'legalLinks'))}" class="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-5 text-sm text-muted-foreground"><a href="/" class="app-footer-link">${escape(siteName)}</a><a href="${locale === 'de' ? '/datenschutz' : '/privacy'}" class="app-footer-link">${escape(t(locale, 'privacyPolicy'))}</a><a href="${locale === 'de' ? '/nutzung' : '/terms'}" class="app-footer-link">${escape(t(locale, 'termsOfUse'))}</a></nav></footer>`;

  /** Static markup with the same structure and classes as the React pages that replace it. */
  const bodyFor = (path: string) => {
    if (path === '/')
      return `<div id="root"><div class="boot-shell" aria-hidden="true"><div class="boot-bar"></div><div class="boot-toolbar"></div><div class="boot-main"><div class="boot-page"></div></div><div class="boot-dock"></div></div></div><noscript><main class="mx-auto max-w-3xl p-6"><h1>${escape(siteName)} – Private rich text editor</h1><p>Enable JavaScript to write, format and export documents. Documents are stored in this browser; no account is required.</p><nav><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Use</a></nav></main></noscript>`;
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
      return `<div id="root"><main class="flex min-h-dvh items-center justify-center bg-background px-6"><div class="w-full max-w-md"><img src="/favicon.svg" alt="" width="32" height="32" class="mb-6 h-8 w-8" /><p class="text-sm font-medium tabular-nums text-muted-foreground">404</p><h1 class="mt-1 text-2xl font-semibold tracking-tight">${escape(t('en', 'notFoundTitle'))}</h1><p class="mt-2 text-muted-foreground">${escape(t('en', 'notFoundDescription'))}</p><a href="/" class="mt-6 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">${escape(t('en', 'legalBackToEditor'))}</a></div></main></div>`;
    const locale = path === '/datenschutz' || path === '/nutzung' ? 'de' : 'en';
    return `<div id="root"><div class="app-shell flex min-h-dvh flex-col bg-background">${legalHeader(locale)}<main class="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14"><article class="legal-prose prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-3xl"><h1>${escape(copy.title)}</h1><p class="text-sm text-muted-foreground">${escape(copy.lastUpdatedLabel)}: ${escape(lastUpdated)}</p><p>${escape(copy.intro)}</p>${contact(copy, locale)}${copy.blocks.map((block) => `<section><h2>${escape(block.heading)}</h2>${(block.paragraphs ?? []).map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}${block.bullets ? `<ul>${block.bullets.map((bullet) => `<li>${escape(bullet)}</li>`).join('')}</ul>` : ''}</section>`).join('')}</article></main>${legalFooter(locale)}</div></div>`;
  };

  const render = (html: string, path: string, preloads = '') =>
    html
      .replace(new RegExp(`\\s*${PRELOAD_START}[\\s\\S]*?${PRELOAD_END}`), '')
      .replace('</head>', preloads ? `  ${preloads}\n  </head>` : '</head>')
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
    transformIndexHtml: {
      order: 'post',
      handler: (html, context) => render(html, '/', editorPreloads(context.bundle, context.chunk)),
    },
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
