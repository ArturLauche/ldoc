# AGENTS.md

## Stack and commands

LWrite is a browser-only, local-first rich-text editor (React + TipTap); there is no backend.

- Package manager: `npm@10.9.2` (`package-lock.json` is authoritative; ignore `bun.lock`).
- Stack (locked in `package-lock.json`): Vite `5.4.21`, React `18.3.1`,
  TypeScript `5.9.3`, TipTap React/StarterKit `3.31.3`, Tailwind `3.4.19`,
  react-router-dom `6.30.6`, Vitest `2.1.9`, ESLint `9.39.5`.
- Keep Vite 5 with Vitest `2.1.x`; Vitest 4 breaks clean installs.
- Cloudflare Pages: build `npm run build`, output `dist`, clean `npm ci` must pass.

```sh
npm install              # install
npm run dev              # dev server (Vite prints URL, normally http://127.0.0.1:8080)
npm run lint             # ESLint
npm run typecheck        # strict app + build configuration TypeScript
npm run test -- --run    # Vitest, single run
npm run build            # production build + HTML/metadata verification
npm run validate         # lint + typecheck + test --run + build (full gate)
```

## Setup and test instructions

1. `npm install`, then `npm run dev`.
2. For changes: run the narrowest check first (`lint` / `typecheck` / `test -- --run`),
   then `npm run validate` before handoff of substantial or cross-cutting work.
3. Do not ignore lint errors, type errors, failing tests, or failed builds.
   Only the known shadcn Fast Refresh and Browserslist/Bluebird/JSZip/chunk-size
   build warnings may stay warnings.
4. After dependency changes: `npm install`, then `npm ci --progress=false`, then
   `npm run validate`. Keep `package.json` and `package-lock.json` in sync.

## Code style (repo-specific)

- Strict TS (`strict`, `noUnusedLocals/Parameters`): no `any`; narrow with unions,
  type guards, and `unknown` validation for external data.
- Path alias `@/*` maps to `./src/*`; use `@/lib/...`, `@/components/...`.
- All localStorage goes through `src/lib/storage.ts`; never call
  `window.localStorage` in new code. Handle its typed result:
- All document HTML (read, import, restore, persist, preview, export) goes through
  `sanitizeDocumentHtml` in `src/lib/sanitizeDocumentHtml.ts`; never add a second sanitizer.
- Keep `RichTextEditor.tsx` a shell; put session logic in hooks, TipTap schema in
  `editorExtensions.ts`, persistence in `src/lib`, conversions in importer/export modules.
  `FileMenu.tsx` stays menu UI + orchestration only.
- Keep effects dependency-complete; refactor state/callbacks instead of suppressing rules.
- Compose shadcn/ui primitives (`src/components/ui/*`); do not rewrite them for one-offs.
- Styling: semantic tokens (`background`, `foreground`, `muted-foreground`, `border`,
  `primary`), lucide-react icons, compact header/toolbar, no control-text overflow on mobile.

```ts
// src/lib/storage.ts — the pattern for all storage access:
export type DocumentStorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'quota' | 'unavailable' | 'invalid-data'; error: unknown };
```

## Project structure

- `src/App.tsx`: routes only (`/`, `/privacy`+`/datenschutz`, `/terms`+`/nutzung`, `*`).
- `src/pages/Index.tsx`: mounts the editor.
- `src/components/Editor/`: `RichTextEditor.tsx` (shell), `useDocumentSession.ts`
  (load/save/autosave/rename/counts/shortcuts/snapshots), `editorExtensions.ts`
  (TipTap setup), `EditorToolbar.tsx`, `FileMenu.tsx`, `DocumentImporter.ts`,
  `VersionHistory.tsx`.
- `src/lib/`: `storage.ts`, `sanitizeDocumentHtml.ts`, `documentLibrary.ts`
  (library/backup/duplicate/delete/migration), `versionHistory.ts`, `media.ts`
  (image validation, 10 MB limit), `fileNames.ts` (`buildExportFileName`),
  `export/documentExport.ts` (`exportDocument({ html, name, locale, format })`
  for `txt|html|rtf|docx|odt|pdf`; lazy-load JSZip).

## Git and PR workflow

- `git status --short --branch` before broad edits; never revert unrelated changes.
- Branch off `main`, open a PR back to `main` (history: `cursor/*`, `claude/*` branches,
  squash/merge as `#48`–`#50`); keep the diff focused and the route surface intentional.
- For this task type docs-only change: commit `AGENTS.md` directly and push to `main`.
- No `.github/workflows` in repo; the deploy gate is Cloudflare Pages clean install + build.

## Boundaries

### Always do

- Sanitize new document-HTML paths with `sanitizeDocumentHtml`.
- Preserve storage keys/migrations: `lwrite-current-doc`, `floatwrite-current-doc`,
  `lwrite-doc-library`, `lwrite-document-versions`,
  `lwrite-document-versions-migrated`, legacy `lwrite-versions`/`floatwrite-versions`.
- Confirm unsaved changes before replacing the open document; save a safety version
  before open-over, import-over, version restore, or discard-for-new.
- Keep 20-version cap per document, 20 MB document / 10 MB image limits,
  library backup shape `{ format: "lwrite-library", version: 1 }`, and fresh ids for
  single-document imports.
- Add or update tests near changed behavior (unit for `src/lib/*`, RTL for flows;
  cover malformed JSON, invalid library files, unsafe HTML, oversize files,
  quota/unavailable storage, replacement guards; for exports check filename + MIME/blob + content).

### Ask first

- Adding a backend, accounts, cloud sync, SSR, Wrangler, new routes, or dependencies
  (prefer browser-safe ESM; lazy-load heavy parse/export deps).
- Changing retention caps, size limits, storage keys, export formats, or the
  `ExportFormat` union.
- Broad rewrites of `src/components/ui/*` or editor layout/theme behavior.

### Never do

- Commit secrets, credentials, or local-only generated files; do not rely on files
  outside the repo for builds.
- Reintroduce `/code`, `CodeStudio`, its storage key, sitemap entry, or docs.
- Build DOCX/ODT/PDF/RTF/HTML export internals in UI code; call `exportDocument`.
- Edit generated output (`dist/`) or update `bun.lock` without a deliberate Bun migration.
