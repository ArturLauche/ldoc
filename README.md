# LWrite

[LWrite](https://write.leunos.com) is a local-first rich-text editor built with React and TipTap. Documents stay in this browser's storage. No account or application backend is required.

## Features

- Rich text, headings, nested lists, links, tables, images, and editable graphics.
- Self-hosted font choices, light/dark themes, and eleven interface languages.
- Autosave after three seconds of inactivity, with a fifteen-second maximum wait during continuous editing, manual save, and visible storage errors.
- Document library with text search, rename, duplication, deletion, and JSON backup/import.
- Up to twenty versions per document, previews, restore, and safety snapshots before replacing a document.
- Cross-tab conflict detection with actions to reload the saved document or save a separate copy.
- Find/replace, word/character counts, and document-only printing.
- Import TXT, HTML, RTF, DOCX, ODT/OTT, and FODT. Export TXT, HTML, RTF, DOCX, ODT, and PDF. Exports report unsupported content rather than silently claiming a perfect conversion.

## Development

Use Node.js 22.13+ (or Node.js 24 LTS) and **npm 10.9.2**. `package-lock.json` is authoritative; the historical `bun.lock` is not used by the build.

```sh
npm ci --progress=false
npm run dev
```

Open the URL Vite prints (normally `http://127.0.0.1:8080`).

```sh
npm run lint          # ESLint
npm run typecheck     # Strict TypeScript
npm run test -- --run # Unit and component tests
npm run build         # Production assets plus HTML/metadata verification
npm run check:build   # Recheck an existing dist directory
npm run preview       # Local Vite production preview
npm run validate      # All required checks
```

Keep Vite 5 with Vitest 2.1.x. Major build-tool upgrades require a separate compatibility review. See [AGENTS.md](AGENTS.md) for repository boundaries and [the quality review](docs/quality-review.md) for audit findings, implementation decisions, measurements, and remaining advisories.

## Persistence and recovery

The current draft, library, versions, locale, and theme use browser storage. Autosave also attempts to flush when the page becomes hidden or closes. When a write fails, the draft remains in memory and the interface offers retry; an exit confirmation is requested if unsaved changes remain. These events cannot guarantee recovery after a browser or operating-system crash.

Clearing site data, using another browser/profile, or changing the origin gives a separate library. Private browsing and storage quotas can prevent persistence. Export a library backup before moving domains or clearing browser data. Backups are local downloads; no cloud copy is created.

Document input is limited to 20 MB and uploaded images to 10 MB. Actual browser storage capacity can be lower. Imports, saves, previews, restores, and exports use the shared HTML sanitizer. Remote images still contact the image server; offline availability and cross-origin export permission depend on that server. Fonts are served from `public/fonts`, without Google Fonts requests.

The application has no service worker. An already loaded editor can work without a connection, but a fresh offline visit is not guaranteed. Concurrent tabs receive conflict warnings, but localStorage does not provide database transactions or atomic compare-and-swap.

## Cloudflare Pages

Use `npm run build`, output directory `dist`, and a clean `npm ci` installation. No server functions or Wrangler configuration are required.

- Runtime links and metadata detect `window.location.origin` automatically.
- Static metadata needs a build-time origin because there is no server executing per request. `VITE_SITE_URL` overrides it; otherwise Cloudflare preview builds use `CF_PAGES_URL` and production defaults to `https://write.leunos.com`.
- The build emits complete static legal pages for `/privacy`, `/terms`, `/datenschutz`, and `/nutzung`, plus `404.html`, `robots.txt`, and `sitemap.xml`. Cloudflare Pages serves matching HTML files and uses the custom 404 for unknown paths. Vite preview's SPA fallback is not an accurate test of the edge's 404 status.
- German legal URLs select German content, language, and alternate links. Legal text remains readable without JavaScript; the editor requires JavaScript.
- Only fingerprinted `/assets/*` files receive immutable caching. Fonts and other stable public paths can revalidate. Production source maps are disabled.

Copy [.env.example](.env.example) to `.env.local` or configure the public values in Cloudflare Pages. Every `VITE_*` value is included in public build output. Configure a real `VITE_LEGAL_CONTACT_EMAIL` **or** `VITE_LEGAL_CONTACT_URL`; the operator has not yet supplied that contact. The app does not invent an address when configuration is missing.

Disable Cloudflare Web Analytics for this Pages project to match the existing no-analytics privacy text. The repository does not include a beacon, but the deployed PR preview received a hosting-injected Cloudflare beacon with CORS failures. This setting requires Cloudflare account access; it cannot be disabled by changing a `VITE_*` value. See [Cloudflare's Pages analytics configuration](https://developers.cloudflare.com/pages/how-to/web-analytics/).

## Architecture

| Location                                                       | Responsibility                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/App.tsx`, `src/pages/`                                    | Existing editor, legal, and not-found routes                        |
| `src/components/Editor/RichTextEditor.tsx`                     | Editor shell and chrome                                             |
| `src/components/Editor/useDocumentSession.ts`                  | Persistence lifecycle, document transitions, conflicts, shortcuts   |
| `src/components/Editor/useDocumentStats.ts`                    | Coalesced document counts and font discovery                        |
| `src/components/Editor/editorExtensions.ts`                    | TipTap schema and extensions                                        |
| `src/lib/storage.ts`, `currentDocument.ts`                     | Typed browser storage and current-record validation                 |
| `src/lib/documentLibrary.ts`, `versionHistory.ts`              | Library, backup/migration, and version retention                    |
| `src/lib/sanitizeDocumentHtml.ts`                              | One document HTML sanitation boundary                               |
| `src/lib/export/`, `src/components/Editor/DocumentImporter.ts` | Format conversion; heavy parsers/exporters load on demand           |
| `src/lib/siteMetadata.ts`, `build/staticPages.ts`              | Shared browser/build metadata and static public output              |
| `src/index.css`, `src/components/ui/`                          | Semantic tokens, document styling, reusable Radix/shadcn primitives |

## License

No license has been selected for this repository.
