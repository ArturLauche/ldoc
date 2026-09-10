# LWrite quality review and implementation plan

Baseline: `e866f11`, reviewed September 2026. Scope: existing browser-only editor,
all public routes, document storage/import/export, accessibility, production
artifacts, and dependency health. No new backend, accounts, routes, formats, or
retention limits. Preserve the logo, local-first model, supported languages,
fonts, tables, graphics, and all existing editing commands.

## Initial assessment

**6.5/10.** Good product depth and useful separation of export logic, sanitation,
and session state. The baseline passes 113 tests across 21 files, lint (with
existing warnings), TypeScript, and production build after `npm ci`.

Short roast: LWrite has six export formats, but its save indicator is still
pretending it has a cloud.

| Area                | Baseline finding                                                                                                                                                                        | Priority |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Document safety     | Current-record parsing trusts field types; failed loads can display saved state; hidden-tab handling snapshots without flushing the draft; safety-version failures are swallowed.       | High     |
| Library/history     | Storage read failures become empty arrays even before writes; invalid version dates can crash the UI; image-only drafts count as empty; failed legacy migration marks itself complete.  | High     |
| Imports             | Corrupt ODT files fall back to binary text and report success; JSON imports read unbounded files; replacement confirmation precedes asynchronous conversion.                            | High     |
| Accessibility       | History is a custom overlay without dialog semantics/focus trapping; image upload is hidden from keyboard access; many toggles lack pressed state.                                      | High     |
| Responsive UI       | Toolbar wraps indiscriminately; document keeps desktop padding on phones; history has a fixed-width sidebar; nested rounded boxes and translucent layers weaken hierarchy.              | High     |
| Visual system       | Multiple radial gradients, blurred surfaces, 16–20px container radii, duplicated shadow tokens, and muted text using the same foreground as primary text.                               | Medium   |
| Performance         | Per-edit count state updates the editor shell; counts traverse the document on every edit; library writes repeatedly sanitize unchanged documents; legal content loads with the editor. | Medium   |
| Fonts               | Loading is tied to selection, so fonts in a restored document may not load until the cursor enters them; unknown imported families can request nonexistent CSS.                         | Medium   |
| Metadata/deployment | Raw `/privacy` HTML has the home title; metadata points to nonresolving `lwrite.app`; runtime origin diverges; German aliases do not determine German content.                          | High     |
| Production          | Custom React 404 exists, but static host responds through the SPA fallback; unhashed public assets get immutable caching; legal contact remains deployment configuration.               | Medium   |
| Documentation       | README contains broken generated citation syntax and stale line references.                                                                                                             | Medium   |
| Dependencies        | `npm audit` reports 19 advisories (including dev-server-only advisories); fixes must respect Vite 5 / Vitest 2.1 constraints.                                                           | Review   |

## Implementation sequence and acceptance criteria

### 1. Make document transitions and persistence dependable

- Validate current records in a library module, normalize timestamps/ids, retain
  legacy keys, and expose typed failure states.
- Centralize replacement confirmation and safety snapshots in the session hook;
  open/import/new/restore must abort cleanly if their safety copy fails.
- Flush pending drafts on hidden-tab/page exit and keep a beforeunload safeguard
  when saving fails. Display an actionable local-storage error rather than a
  misleading saved icon.
- Protect against edits from another tab; make recovery/reloading or saving a
  separate copy explicit instead of silently overwriting another version.
- Keep corrupt library/history data intact during attempted mutations. Retain
  the 20-version cap, including migration, and support image-only snapshots.
- Reject malformed ODT/FODT and oversized document/library input before replacing
  the current draft. All HTML continues through the existing sanitizer.
- Tests: malformed JSON/field types, storage quota/unavailability, rapid save
  lifecycle, replacement cancellation/failure, multi-tab conflict, migration.

### 2. Refine the complete interface

- Replace glass gradients with quiet slate chrome and a clear document surface;
  retain DM Sans, the LWrite mark, and the overall editor information architecture.
- Use a compact spacing/radius system, clear foreground/muted roles, restrained
  borders/shadows, obvious focus/pressed/disabled states, and touch-friendly sizes.
- Keep essential formatting visible; place secondary controls in an explicitly
  labelled expandable area on small screens. Preserve every command.
- Use the existing Radix/shadcn dialog for responsive history and confirmation;
  flatten library rows, distinguish an empty library from an empty search, and
  keep search focused on visible document text.
- Make font search/localization, image upload, and link editing predictable.
- Add document-only print styling and a working print command.
- Review editor, file menu, library, rename, history, image dialog, graphics,
  table controls, find/replace, privacy, terms, aliases, and 404 in light/dark,
  desktop/mobile, and keyboard flows.

### 3. Optimize measured work without feature loss

- Isolate editor transaction subscriptions from app chrome using TipTap's
  documented `shouldRerenderOnTransaction` / `useEditorState` pattern.
- Coalesce count refreshes; avoid re-sanitizing unchanged library records using
  a bounded cache keyed by the actual persisted string, never just an in-memory
  revision. Cross-tab changes must invalidate it automatically.
- Load all known fonts used by a document, without loading the entire catalog.
- Split legal route code from editor startup and keep parsers/PDF export lazy.
- Record before/after bundle and browser measurements; avoid speculative workers,
  virtualization, or changing document behavior to win a benchmark.

### 4. Make public output and deployment honest

- User-confirmed production domain: `write.leunos.com`. Runtime URLs derive from
  the active origin; build-time canonical/social/sitemap output is configurable.
- Share metadata generation for the current routes and emit static route shells
  and a real 404 artifact without introducing SSR or a runtime backend.
- Ensure German aliases have German content/language and accurate alternate links.
- Preserve existing favicon/social assets; remove the unverified Twitter handle,
  placeholder deployment URLs, stale metadata, and inaccurate immutable caching.
- Add a concise factual `llms.txt`; do not expose local documents or claim that
  this file is an SEO ranking feature.
- Make missing legal contact an explicit deployment concern, without inventing
  an email or responsible party. Audit output must disclose any unresolved input.
- Refresh compatible existing dependencies, retain Vite 5 and Vitest 2.1, and
  report remaining advisories and their actual deployment relevance.

### 5. Verify and hand off

- Run focused regressions first, then clean install and `npm run validate`.
- Inspect built HTML, route artifacts, links, metadata, source-map exposure,
  console output, startup requests, desktop/mobile overflow, and key user flows.
- Record results and material limitations here, rewrite README around actual
  behavior, commit the focused change set, push, and open a PR targeting `main`.

## Implemented results

The work follows the sequence above. The editor keeps its existing commands,
formats, languages and storage keys. The main changes are:

- **Persistence:** validated current-record reads, actual local save status,
  bounded autosave delay, exit/visibility flushes, actionable failure states,
  replacement safety versions, and cross-tab conflict recovery. Opening a
  different document resets undo history; startup restoration is excluded from
  undo so an immediate undo cannot empty a saved draft. Deletions are checked at
  write time even when a storage event has not arrived.
- **Library and history:** strict mutation reads preserve corrupt data;
  validated dates and unique ids prevent broken previews or ambiguous deletes;
  migration retries preserve both legacy stores; image/table/graphic-only
  documents receive versions. Library search uses visible text with paragraph
  boundaries and has separate empty, no-match and storage-error states.
- **Imports and exports:** malformed ODT/FODT and oversized input fail before
  replacing the draft; HTML imports retain bold/italic markup while removing
  unsafe content. Exported HTML has an escaped document language. Image exports
  deduplicate fetches within a single export, bound streaming downloads, time
  out stalled work and reuse fetched bytes for conversion. All six formats
  remain available and their converters stay outside menu UI.
- **Interface:** opaque slate chrome, consistent semantic contrast, 8px control
  and dialog radii, a 4px paper radius, compact 36px toolbar controls, deliberate
  document padding and responsive secondary formatting. Library rows and legal
  sections replace unnecessary containers. History uses the shared dialog with
  a responsive preview, keyboard focus trapping and return focus. Image upload,
  links, table grid semantics, active formatting, graphic text contrast and
  document-only printing have been checked and repaired.
- **Architecture and rendering:** document statistics/font discovery are
  isolated from the session state; library UI and shared contexts are extracted.
  Editor transactions use selective subscriptions, and editor creation waits
  for the React commit so lazy/concurrent route rendering cannot reuse a
  disposed TipTap instance. Deferred route failures have a reload action that
  leaves stored documents intact. These choices follow the relevant
  [TipTap performance guidance](https://tiptap.dev/docs/guides/performance).
- **Production artifacts:** one metadata source supplies runtime and generated
  HTML; the active browser origin is detected automatically. The static build
  defaults to `https://write.leunos.com`, accepts `VITE_SITE_URL`, and supports
  Cloudflare preview origins. Existing legal routes have complete initial HTML,
  unique titles/descriptions, language, canonical/alternate links and structured
  data. The build creates a noindex `404.html`, a five-path sitemap and a small
  robots file. Favicons and the real social image are retained; `llms.txt` is
  factual. Cache headers reserve immutable caching for fingerprinted assets.
  A custom 404 artifact is necessary for the intended edge behavior described
  in [Cloudflare Pages serving rules](https://developers.cloudflare.com/pages/configuration/serving-pages/).
- **Build gate:** `npm run typecheck` checks application and build TypeScript.
  `npm run build` now verifies initial HTML, metadata, linked assets, sitemap
  coverage and absence of public source maps. README and the environment
  example describe the actual deployment/storage model.

## Measurements

Measurements were made in local Chromium with identical fixtures. They are
diagnostic comparisons, not a promise about every device or document.

| Measurement                                                                  |                Baseline |        Updated | Interpretation                                                                                                     |
| ---------------------------------------------------------------------------- | ----------------------: | -------------: | ------------------------------------------------------------------------------------------------------------------ |
| Library upsert, median of 10 warmed operations, 40 documents × 30 paragraphs |                 31.0 ms |         3.1 ms | About 90% less time in this operation; this does not measure the entire save lifecycle.                            |
| DOMParser calls per upsert for that fixture                                  |                      81 |              1 | Unchanged entries reuse a bounded cache keyed by the actual stored string.                                         |
| Shared entry JavaScript, gzip                                                |                283.6 kB |       114.0 kB | Legal routes no longer import the editor engine.                                                                   |
| Home startup JavaScript, sum of encoded responses                            |                317.9 kB | about 329.8 kB | About 4% higher after dependency updates and recovery/accessibility additions; no claim of a smaller home payload. |
| Updated privacy-page startup JavaScript, sum of encoded responses            | Not separately measured | about 128.3 kB | Includes shared code, route, legal content and metadata; excludes the editor.                                      |
| Lint warnings                                                                |                       5 |              3 | Remaining warnings belong to existing shadcn shared exports.                                                       |
| npm audit vulnerable-package count                                           |                      19 |              7 | Compatible updates only; remaining advisories are explained below.                                                 |

Counts and font discovery coalesce to at most one scheduled refresh per 250ms
of editing; selection-only transactions skip traversal. These changes reduce
work but do not establish a measured speedup for every keystroke. Heavy PDF and
document import code remains deferred. The large PDF export chunk still triggers
Vite's size warning and is only requested when that export is used.

## Verification record

- Clean installation with npm 10.9.2 succeeded after the compatible dependency
  refresh. No new direct dependencies or Bun lock changes were introduced.
- `npm run validate` passed after that clean installation: lint, application
  and build TypeScript, all 180 tests, production build and HTML verification.
- The test suite grew from 113 tests in 21 files to 180 tests in 29 files.
  Regressions cover invalid JSON/fields, unavailable/quota-limited storage,
  delayed cross-tab deletion, replacement guards, startup/open undo boundaries,
  migration, unsafe HTML, import limits, export content/MIME/filenames, streamed
  images, counts and fonts. A cold lazy-module assertion now allows three
  seconds for the first test transform; its original one-second wait was flaky
  under full-suite load.
- Browser review covered 50 desktop/mobile screen states: editor, file menu,
  library and search results, rename, history, find/replace, image/link/font/table
  controls, seven graphic categories, light/dark, four legal routes and 404.
  The second review found no WCAG A/AA violations or horizontal overflow in
  those states. Two non-WCAG axe landmark notices remain for the open File menu
  portal (desktop/mobile); the menu retains native menu semantics and keyboard
  behavior. Automated scanning is not a substitute for a full assistive-tech
  audit.
- Additional checks covered 320/375/768/1440 widths, all eleven locales including
  Arabic direction, empty/error/quota states, all six actual downloads, fonts on
  restore, table insertion/editing, graphics editing, backup/import, print,
  two-tab recovery, dialog return focus and a failed lazy-chunk recovery screen.
- Generated legal content is readable with JavaScript disabled. A local static
  file server verified known-route 200s and unknown-route 404s against the built
  artifacts. This verifies the files and intended serving rules; it is not a
  claim that the PR is already deployed on Cloudflare.

## Remaining deployment inputs and risks

**Legal contact remains unconfigured.** The operator confirmed the production
domain but has not supplied a public contact email or contact-page URL. Configure
`VITE_LEGAL_CONTACT_EMAIL` or `VITE_LEGAL_CONTACT_URL` before treating the legal
pages as complete. No email or responsible-party identity was invented, and the
existing legal wording has not been presented as a legal compliance assessment.

**Seven audit findings remain: five moderate, one high and one critical.** The
affected packages are Vite, esbuild, Vitest, vite-node, @vitest/mocker,
react-router and react-router-dom. The repository explicitly requires Vite 5
with Vitest 2.1. A forced audit fix would cross those major-version boundaries;
Router's remaining fixes also require a major upgrade. This PR does not suppress
the audit or describe the pinned toolchain as vulnerability-free.

The clean install also reports ESLint 9's end-of-support deprecation. Its next
major version and plugin peer requirements need a coordinated tooling update.

- Vitest's critical advisory concerns exposed UI/API servers and Windows
  UI/Browser mode. This repository validates using `vitest --run`, does not
  enable a UI/API server, and deploys static assets. That limits the relevance
  to the deployed site, while the vulnerable development dependency remains.
  See the [upstream Vitest advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp).
- Vite/esbuild and the related mocker findings concern development/server
  tooling. The configured development server binds to `127.0.0.1`; these tools
  are not part of the static production runtime. A future supported toolchain
  migration must address the advisories, including
  [Vite's Windows file-deny bypass](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)
  and [the mocker path traversal](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
- React Router's SSR hydration issue explicitly excludes declarative mode,
  which LWrite uses. The open-redirect advisory requires attacker-supplied
  navigation paths; source review found only fixed internal destinations in
  router links and no user-document links passed to the router. This is an
  application-specific assessment, not a package-level fix. See the upstream
  [hydration advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-337j-9hxr-rhxg)
  and [navigation advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-wrjc-x8rr-h8h6).

localStorage still has no atomic cross-tab transactions and can fail on quota
or browser shutdown. Export backups remain necessary. There is no service
worker or guaranteed fresh offline startup. Runtime origin detection cannot
rewrite raw HTML before a crawler executes JavaScript; deployments on another
production host must configure the static build origin. Actual Cloudflare
deployment status and public contact configuration require follow-through at
release time.
