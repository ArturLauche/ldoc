/// <reference types="vite/client" />

// Build-time environment variables consumed by `src/lib/siteConfig.ts`.
// All `VITE_*` variables are inlined into the public client bundle, so only
// configure values that are safe to publish. See `.env.example`.
interface ImportMetaEnv {
  readonly VITE_SITE_NAME?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_LEGAL_CONTROLLER_NAME?: string;
  readonly VITE_LEGAL_CONTACT_EMAIL?: string;
  readonly VITE_LEGAL_CONTACT_URL?: string;
  readonly VITE_LEGAL_JURISDICTION?: string;
  readonly VITE_LEGAL_LAST_UPDATED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
