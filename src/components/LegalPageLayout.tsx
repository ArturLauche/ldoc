import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { t as translate, type TranslationKey } from '@/lib/translations';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';
import { siteConfig, hasControllerContact } from '@/lib/siteConfig';
import type { LegalCopy } from '@/lib/legalContent';

interface LegalPageLayoutProps {
  copy: LegalCopy;
  locale: 'en' | 'de';
}

/**
 * Shared chrome for the public legal pages (privacy / terms). Defined once so
 * both pages share the same header, contact card, typography and footer links.
 */
export const LegalPageLayout = ({ copy, locale }: LegalPageLayoutProps) => {
  const t = (key: TranslationKey) => translate(locale, key);

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-background">
      <header className="app-bar sticky top-0 z-40">
        <div className="mx-auto flex h-12 w-full max-w-3xl items-center justify-between px-5">
          <Link to="/" className="flex min-w-0 items-center gap-2 rounded-sm">
            <BrandLogo title={siteConfig.siteName} />
            <span className="truncate text-sm font-semibold tracking-tight">
              {siteConfig.siteName}
            </span>
          </Link>
          <Link
            to="/"
            aria-label={t('legalBackToEditor')}
            className="-me-2 flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('legalBackToEditor')}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14">
        <article className="legal-prose prose max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-3xl">
          <h1>{copy.title}</h1>
          <p className="text-sm text-muted-foreground">
            {copy.lastUpdatedLabel}: {siteConfig.lastUpdated}
          </p>
          <p>{copy.intro}</p>

          {/* Controller / contact card.
              Values come from build-time VITE_LEGAL_* env vars (see
              src/lib/siteConfig.ts). A single contact email is enough.
              Production deployments MUST configure at least one contact;
              otherwise a neutral placeholder (plus a dev-only hint) is shown. */}
          <section className="not-prose my-6 border-y border-border py-5 text-card-foreground">
            <h2 className="text-base font-semibold mb-2">{copy.contactHeading}</h2>
            {hasControllerContact ? (
              <ul className="space-y-1 text-sm">
                {siteConfig.controllerName && (
                  <li>
                    <span className="text-muted-foreground">{copy.contactNameLabel}:</span>{' '}
                    {siteConfig.controllerName}
                  </li>
                )}
                {siteConfig.contactEmail && (
                  <li>
                    <span className="text-muted-foreground">{copy.contactEmailLabel}:</span>{' '}
                    <ObfuscatedEmail email={siteConfig.contactEmail} />
                  </li>
                )}
                {siteConfig.contactUrl && (
                  <li>
                    <span className="text-muted-foreground">{copy.contactUrlLabel}:</span>{' '}
                    <a
                      className="underline"
                      href={siteConfig.contactUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {siteConfig.contactUrl}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{copy.contactPlaceholder}</p>
                {/* Dev-only: nudges the operator to configure a contact email.
                    Never rendered in production builds. */}
                {import.meta.env.DEV && (
                  <p className="rounded-md border border-dashed border-border bg-muted/30 px-2 py-1 text-xs italic text-muted-foreground">
                    {copy.contactDevHint}
                  </p>
                )}
              </div>
            )}
            {/* Jurisdiction is always shown, with or without a configured contact. */}
            <p className="mt-3 text-sm">
              <span className="text-muted-foreground">{copy.jurisdictionLabel}:</span>{' '}
              {siteConfig.jurisdiction}
            </p>
          </section>

          {copy.blocks.map((block) => (
            <section key={block.heading}>
              <h2>{block.heading}</h2>
              {block.paragraphs?.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {block.bullets && (
                <ul>
                  {block.bullets.map((bullet, index) => (
                    <li key={index}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </main>

      <footer className="legal-footer">
        <nav
          aria-label={t('legalLinks')}
          className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-5 text-sm text-muted-foreground"
        >
          <Link to="/" className="app-footer-link">
            {siteConfig.siteName}
          </Link>
          <Link to={locale === 'de' ? '/datenschutz' : '/privacy'} className="app-footer-link">
            {t('privacyPolicy')}
          </Link>
          <Link to={locale === 'de' ? '/nutzung' : '/terms'} className="app-footer-link">
            {t('termsOfUse')}
          </Link>
        </nav>
      </footer>
    </div>
  );
};
