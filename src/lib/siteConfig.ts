/**
 * Site identity and legal/data-controller contact configuration.
 *
 * LWrite is a purely client-side (static) Vite single-page app — there is no
 * server or runtime backend that could keep "private" values out of the
 * browser. Every value below is read from `import.meta.env` at BUILD time and
 * ships inside the public client bundle. Only configure values you are willing
 * to publish.
 *
 * This is acceptable for legal/contact data: under GDPR a responsible party's
 * contact details have to be publicly reachable anyway. Do NOT put any value
 * here that must stay secret.
 *
 * IMPORTANT FOR PRODUCTION DEPLOYMENTS:
 *   Configure the `VITE_LEGAL_*` variables (e.g. in Cloudflare Pages build
 *   settings) before going live. See `.env.example`. If the controller/contact
 *   variables are left empty, the privacy and terms pages fall back to a
 *   neutral development placeholder instead of a real contact, which is not
 *   sufficient for a public production deployment.
 */

const env = import.meta.env;

const cleaned = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

const withFallback = (value: string | undefined, devFallback: string): string => {
  const trimmed = cleaned(value);
  return trimmed.length > 0 ? trimmed : devFallback;
};

const runtimeOrigin = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
};

export const siteConfig = {
  /** Public project name. */
  siteName: withFallback(env.VITE_SITE_NAME, 'LWrite'),
  /** Canonical public site URL. Falls back to the current origin in dev. */
  siteUrl: withFallback(env.VITE_SITE_URL, runtimeOrigin()),
  /** Responsible person/entity (data controller). Empty until configured. */
  controllerName: cleaned(env.VITE_LEGAL_CONTROLLER_NAME),
  /** Public contact email the operator intentionally exposes. Empty until configured. */
  contactEmail: cleaned(env.VITE_LEGAL_CONTACT_EMAIL),
  /** Public contact URL/form the operator intentionally exposes. Empty until configured. */
  contactUrl: cleaned(env.VITE_LEGAL_CONTACT_URL),
  /** Governing jurisdiction for the project. */
  jurisdiction: withFallback(env.VITE_LEGAL_JURISDICTION, 'Germany / EU'),
  /** Last review date shown on the legal pages (YYYY-MM-DD). */
  lastUpdated: withFallback(env.VITE_LEGAL_LAST_UPDATED, '2026-06-15'),
} as const;

/**
 * True when the operator has configured at least one real way to reach the
 * data controller. When false, the legal pages must show the neutral
 * development placeholder and (in production) this signals missing config.
 */
export const hasControllerContact =
  siteConfig.controllerName.length > 0 ||
  siteConfig.contactEmail.length > 0 ||
  siteConfig.contactUrl.length > 0;
