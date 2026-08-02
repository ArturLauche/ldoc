import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { useLocale } from '@/components/locale-provider';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';
import { siteConfig, hasControllerContact } from '@/lib/siteConfig';
import type { LegalCopy } from '@/lib/legalContent';

interface LegalPageLayoutProps {
  copy: LegalCopy;
}

/**
 * Shared chrome for the public legal pages (privacy / terms). Defined once so
 * both pages share the same header, contact card, typography and footer links.
 */
export const LegalPageLayout = ({ copy }: LegalPageLayoutProps) => {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-background flex flex-col app-shell">
      <header className="glass-bar sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-12 max-w-3xl mx-auto w-full">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <BrandLogo title={siteConfig.siteName} />
            <span className="font-semibold text-sm tracking-tight truncate">
              {siteConfig.siteName}
            </span>
          </Link>
          <Link
            to="/"
            aria-label={t('legalBackToEditor')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('legalBackToEditor')}</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10">
        <article className="prose prose-neutral dark:prose-invert max-w-none">
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
          <section className="not-prose my-6 rounded-xl border border-border bg-card p-4 text-card-foreground">
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

      <footer className="px-4 py-4 glass-bar glass-bar--footer">
        <nav className="max-w-3xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground transition-colors">
            {siteConfig.siteName}
          </Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            {t('privacyPolicy')}
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            {t('termsOfUse')}
          </Link>
        </nav>
      </footer>
    </div>
  );
};
