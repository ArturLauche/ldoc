# AGENTS.md

## Scope

This file applies to the entire repository.

LWrite is a browser-only, local-first rich text editor built with Vite, React,
TypeScript, TipTap, Tailwind CSS, and shadcn/ui primitives. It stores documents,
the active document, and version history in `localStorage`. Do not add a backend,
accounts, cloud sync, server rendering, or hidden routes unless the user asks for
that explicitly.

## Working Rules

- Use `npm` as the package manager. `packageManager` is `npm@10.9.2`; keep
  `package-lock.json` authoritative. Do not update `bun.lock` unless the project
  is deliberately migrated to Bun.
- Keep `package.json` and `package-lock.json` in sync. Cloudflare Pages runs an
  npm clean install, so always verify dependency changes with
  `npm.cmd ci --progress=false` on Windows or `npm ci --progress=false` elsewhere.
- This app currently uses Vite 5. Keep Vitest on a Vite-5-compatible line unless
  Vite is upgraded too. `vitest@2.1.x` is compatible; `vitest@4.x` pulls newer
  Vite-era dependency constraints and can break clean installs.
- Preserve existing user work. Check `git status --short --branch` before broad
  edits and do not revert unrelated changes.
- Do not reintroduce the old hidden Code Studio concept. There should be no
  `/code` route, `CodeStudio` page, storage key, sitemap entry, or docs for it.

## Commands

Use these commands from the repository root:

```sh
npm install
npm run dev
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm run validate
```

`npm run validate` is the full local gate: lint, typecheck, tests, and production
build. Before handing off a code change, run the narrowest relevant command first,
then run `npm run validate` for substantial or cross-cutting changes.

Known non-blocking warnings are acceptable only if they stay warnings:

- shadcn/ui Fast Refresh warnings from files that export both components and
  variants/helpers.
- Vite build warnings about stale Browserslist data, Bluebird `eval`, JSZip
  chunking, and large editor chunks.

Do not ignore lint errors, type errors, failing tests, or failed production builds.

## Project Map

- `src/App.tsx` defines the app shell and routes. Keep the public route surface
  small: `/` for the editor and `*` for not found.
- `src/pages/Index.tsx` mounts the editor.
- `src/components/Editor/RichTextEditor.tsx` is the editor shell: header,
  toolbar, editor content, footer, and version-history modal wiring.
- `src/components/Editor/editorExtensions.ts` owns TipTap extension setup. Add or
  adjust editor schema/mark behavior here, not inline in the shell.
- `src/components/Editor/useDocumentSession.ts` owns the active document session:
  load, save, autosave, rename, counts, shortcuts, safety snapshots, and restore.
- `src/components/Editor/EditorToolbar.tsx` owns formatting controls.
- `src/components/Editor/FileMenu.tsx` should stay menu UI and orchestration. Do
  not put file-format builders, storage parsers, or large conversion logic back
  into this component.
- `src/components/Editor/DocumentImporter.ts` imports user document files into
  sanitized editor HTML.
- `src/components/Editor/VersionHistory.tsx` is the version-history UI.
- `src/lib/storage.ts` is the localStorage facade with typed success/error
  results.
- `src/lib/sanitizeDocumentHtml.ts` is the central HTML allowlist sanitizer.
- `src/lib/documentLibrary.ts` owns document library persistence, backup export,
  backup import, single-document import, duplicate, delete, and migration.
- `src/lib/versionHistory.ts` owns version persistence and legacy migration.
- `src/lib/export/documentExport.ts` owns export generation for `txt`, `html`,
  `rtf`, `docx`, `odt`, and `pdf`.
- `src/lib/media.ts` owns image validation and image URL/data URL normalization.
- `src/lib/fileNames.ts` owns export file-name cleanup.
- `src/components/ui/*` are shadcn/ui primitives. Avoid broad rewrites there
  unless the change is specifically about shared UI primitives.

## Reliability Requirements

Document safety is the highest-priority constraint in this codebase.

- Preserve these localStorage keys and migrations:
  - `lwrite-current-doc`
  - `floatwrite-current-doc`
  - `lwrite-doc-library`
  - `lwrite-document-versions`
  - `lwrite-document-versions-migrated`
  - legacy version keys `lwrite-versions` and `floatwrite-versions`
- Use `src/lib/storage.ts` for localStorage access. Do not call
  `window.localStorage` directly in new code.
- Handle storage failures explicitly. Keep the typed result shape
  `{ ok: true; value: T } | { ok: false; code: "quota" | "unavailable" | "invalid-data"; error: unknown }`.
- Sanitize every path that reads, imports, restores, persists, previews, or
  exports document HTML. Use `sanitizeDocumentHtml`; do not create a second
  sanitizer.
- Keep unsafe HTML out of TipTap, localStorage, version history, backups, and
  export builders.
- Preserve unsaved-change confirmation before replacing the current document.
- Save a safety version before destructive operations such as opening over the
  current document, importing over it, restoring a version, or discarding for a
  new document.
- Keep version history capped at 20 versions per document unless the user asks
  for a different retention policy.
- Keep document imports size-limited. Current limits are 20 MB for documents and
  10 MB for images.
- Validate library backup files. Unified library files must use
  `format: "lwrite-library"` and `version: 1`.
- Single-document imports should create a fresh document id to avoid overwriting
  an existing local document unexpectedly.

## Import And Export Boundaries

- UI code should call `exportDocument({ html, name, locale, format })` and then
  download the returned blob. UI code should not build DOCX, ODT, PDF, RTF, or
  HTML export internals.
- Keep `ExportFormat = "txt" | "html" | "rtf" | "docx" | "odt" | "pdf"` as the
  shared internal export format union.
- Sanitize HTML before parsing it for export.
- Use `buildExportFileName` for exported file names.
- Keep heavy dependencies such as JSZip lazy-loaded where practical.
- For new import formats, parse into constrained HTML and pass the final result
  through `sanitizeDocumentHtml`.

## TypeScript And React

- Strict TypeScript is enabled for app code. Avoid `any`; use narrow unions,
  type guards, and `unknown` validation for external data.
- Prefer focused hooks and library functions over expanding large components.
- Keep `RichTextEditor.tsx` as a shell. Put session behavior in hooks, TipTap
  setup in `editorExtensions.ts`, import/export logic in `src/lib` or focused
  importer modules, and shared persistence behavior in `src/lib`.
- Use existing path aliases such as `@/lib/...` and `@/components/...`.
- Keep React effects dependency-complete. If a dependency looks noisy, refactor
  the callback or state shape rather than suppressing the rule.
- Avoid changing generated shadcn/ui components for one-off feature behavior.
  Compose them from editor-specific components instead.

## Styling And UX

- Preserve the editor-first layout. The header and toolbar should stay compact so
  the document canvas has room.
- Use semantic design tokens (`background`, `foreground`, `muted-foreground`,
  `border`, `primary`) so light/dark mode remains readable.
- Headings inside the editor must follow theme foreground colors unless the user
  explicitly applies a text color.
- Use lucide-react icons for toolbar/menu controls when a suitable icon exists.
- Keep text inside controls from overflowing at mobile sizes.
- After UI changes, browser-check the editor in desktop and mobile-width
  viewports. Verify typing, saving, theme toggle, toolbar layout, imports,
  exports, and version restore when touched.

## Testing Expectations

- Add or update tests near the behavior being changed.
- Prefer unit tests for `src/lib/*` behavior: sanitizer, storage failures,
  document library merge/import/export, file-name cleanup, media validation,
  version caps, and exporter parsing.
- Use React Testing Library for editor/component flows. Test user-observable
  behavior rather than implementation details.
- Regression tests should cover malformed JSON, invalid library files, unsafe
  HTML, oversized images/documents, localStorage quota/unavailable failures, and
  unsaved-change replacement guards when relevant.
- For export changes, verify at least the returned file name, MIME type or blob
  shape, and representative parsed content.

## Dependency Policy

- Add dependencies only when they remove real complexity or cover a hard domain
  problem. Prefer browser-safe, ESM-compatible packages.
- Keep document parsing/export dependencies out of the initial editor path when
  lazy loading is reasonable.
- After adding, removing, or changing dependencies, run:

```sh
npm install
npm.cmd ci --progress=false
npm run validate
```

Use the non-`.cmd` form on non-Windows systems.

## Cloudflare Pages

The app is a static Vite build. Cloudflare Pages should not need Wrangler for the
current architecture.

- Build command: `npm run build`
- Output directory: `dist`
- Keep clean installs passing with npm and the committed lockfile.
- Do not rely on local-only generated files outside the repository.

## Handoff Checklist

Before finishing substantial work, verify:

- The route surface is still intentional.
- Storage keys and migrations are preserved.
- All new document HTML paths use `sanitizeDocumentHtml`.
- Destructive document actions protect unsaved work.
- Import/export code stays outside menu UI.
- Tests were added or updated for changed behavior.
- `npm run validate` passes, or any skipped command is explained clearly.
