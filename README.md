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

Use **Node.js 24.21.0** (pinned in `.node-version`) and **npm 10.9.2**. The supported Node ranges are `^22.22.2 || ^24.15.0 || >=26.0.0`; older versions do not meet the test environment's requirements. `package-lock.json` is authoritative; the historical `bun.lock` is not used by the build.

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
npm run validate      # Lint, types, unit/component tests and production build
npx playwright install chromium # Install the browser for persistence checks
npm run test:browser -- --project=chromium # Test production persistence at size limits
npm run audit         # Runtime and development dependency advisories
```

The supported stack is React 19, Router 7, Vite 8, Vitest 5, Tailwind 4, and ESLint 10. TypeScript 6.0.3 is held on its compatible minor because typescript-eslint currently requires TypeScript below 6.1. See [the major-version review](docs/dependency-upgrade.md) for compatibility decisions and verification, [AGENTS.md](AGENTS.md) for repository boundaries, and [the quality review](docs/quality-review.md) for the broader implementation.

Supported browser floors are Chrome/Edge 111, Firefox 128, and Safari 16.4, following [Tailwind 4's CSS requirements](https://tailwindcss.com/docs/upgrade-guide#browser-requirements). Use a current browser for supported security updates. Theme tokens, font stacks, and Tailwind source paths live in `src/index.css`.

GitHub Actions runs the clean npm install, full validation, dependency audit, and Chromium persistence regressions on pull requests. Cloudflare Pages also verifies its production clean install and build. See [PR review decisions](docs/pr-review-followup.md) for the persistence migration and archive limits.

## Persistence and recovery

The current draft, library, versions, locale, and theme use browser storage. Autosave also attempts to flush when the page becomes hidden or closes. When a write fails, the draft remains in memory and the interface offers retry; an exit confirmation is requested if unsaved changes remain. These events cannot guarantee recovery after a browser or operating-system crash.

Clearing site data, using another browser/profile, or changing the origin gives a separate library. Private browsing and storage quotas can prevent persistence. Export a library backup before moving domains or clearing browser data. Backups are local downloads; no cloud copy is created.

Document input is limited to 20 MB and uploaded images to 10 MB. Actual browser storage capacity can be lower. Imports, saves, previews, restores, and exports use the shared HTML sanitizer. Remote images still contact the image server; offline availability and cross-origin export permission depend on that server. Fonts are served from `public/fonts`, without Google Fonts requests.

The application has no service worker. An already loaded editor can work without a connection, but a fresh offline visit is not guaranteed. Documents and version history use IndexedDB. Saves check for conflicts and commit the current record and library in one transaction. Existing localStorage document keys are read during migration and retained as recovery sources; IndexedDB becomes authoritative when the corresponding records are written. Theme and language remain in localStorage. Browser storage can still be cleared or run out of space, so keep downloaded backups.

## Cloudflare Pages

Use `npm run build`, output directory `dist`, and a clean `npm ci` installation. Cloudflare supports the committed `.node-version`; if the project has an explicit `NODE_VERSION` override, align it with `24.21.0`. No server functions or Wrangler configuration are required.

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
