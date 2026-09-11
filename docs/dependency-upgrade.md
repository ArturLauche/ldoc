# Major-version compatibility review

Reviewed on 2026-09-10–11, following the explicit authorization to replace the former
Vite 5 / Vitest 2 restriction. This continues the [quality review](quality-review.md).

The npm lockfile reports **zero known vulnerabilities**, including development
dependencies. This is a registry advisory result at the time of the check, not a
guarantee that the application or its dependencies contain no vulnerabilities.

## Migration and compatibility decisions

| Area | Previous version | Verified version | Required integration work |
| --- | --- | --- | --- |
| React / React DOM | 18.3.1 | 19.3.0 | Nullable DOM refs, explicit timer-ref initialization, commit-time callback updates; matching React type packages. |
| React Router | 6.30.6 | 7.18.3 | Remove obsolete v7 future flags; preserve declarative routing and the existing route surface. |
| Vite | 5.4.21 | 8.3.0 | Rolldown build, explicit configuration import extensions, ESM path resolution, static-page plugin verification. |
| React Vite plugin | SWC 3.11.0 | `@vitejs/plugin-react` 6.1.1 | Use Vite's native Oxc transform; verify Fast Refresh preserves the current draft. |
| Vitest | 2.1.9 | 5.0.0 | Compatible Vite peer graph, existing jsdom test isolation, real editor and conversion regressions. |
| jsdom | 29.1.1 | 30.0.1 | Raise the Node floor to the supported engine ranges. |
| Tailwind | 3.4.19 | 4.3.3 | Vite plugin and CSS theme/source declarations; remove old Tailwind/PostCSS configuration. |
| tailwind-merge | 2.6.1 | 3.6.0 | Match Tailwind 4 utility conflict handling. |
| ESLint | 9.39.5 | 10.10.0 | Compatible plugins; resolve the new React hooks rules without disabling them. |
| TypeScript | 5.9.3 | 6.0.3 | Strict app and build checks; hold the compatible minor until the ESLint parser supports newer versions. |
| Supporting UI/test packages | Previous lockfile | Current registry releases | Update Radix, Lucide, Sonner, next-themes, Testing Library, globals, and type packages together. |

All direct dependency versions match their registry `latest` tags except
TypeScript. `typescript-eslint@8.70.0` declares `typescript >=4.8.4 <6.1.0`, while
TypeScript's latest tag is 7.0.2. The project therefore uses `~6.0.3`, with no forced
peer resolution, audit suppression, or package overrides. Revisit this hold when
the parser's supported range changes; see [typescript-eslint's compatibility policy](https://typescript-eslint.io/users/dependency-versions/).

Node.js 24.21.0 is pinned in `.node-version`. Supported engines are
`^22.22.2 || ^24.15.0 || >=26.0.0`, matching jsdom 30. npm 10.9.2 remains the
repository's package manager and `package-lock.json` remains authoritative.
Cloudflare Pages supports `.node-version`; align any explicit `NODE_VERSION`
override with that file. See [Cloudflare's build image configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

## Code and interface changes

- Keep the TipTap schema stable across React renders. A typed command changes
  placeholder decorations when the language changes without replacing the editor,
  modifying its content, or adding undo history.
- Update autosave callback refs after commit, so an abandoned concurrent render
  cannot replace the callbacks used by persistence and page-exit handlers.
- Move graphic-item selection into a typed TipTap command. Dry-run `can()` checks
  do not mutate storage, and selection does not add a document undo step.
- Refresh the document library in open/import/save/delete handlers. Initialize
  version history on opening, keyed by document id. Reset the table picker when
  it opens. These remove unnecessary effect-driven renders.
- Keep colors, font stacks, radii, shadows, spacing, and dark-mode behavior in
  CSS theme tokens. Update removed utility names and retain forced-color focus
  outlines with `outline-hidden`.
- Remove the dialogs' old directional slide transforms: Tailwind 4's separate
  translate property caused the previous animation to translate twice. Centered
  fade/scale transitions preserve the final layout and reduced-motion support.

The [Tailwind migration guide](https://tailwindcss.com/docs/upgrade-guide) sets the
CSS browser floor at Chrome/Edge 111, Firefox 128, and Safari 16.4. The
[Vite migration guide](https://vite.dev/guide/migration) and
[official React plugin](https://vite.dev/plugins/#official-plugins) describe the
Rolldown/Oxc integration used here. Heavy PDF, ZIP, and document-import modules
remain lazy; actual downloads and re-imports verify their production interop.

## Measurements

Measured in fresh Chromium contexts against locally served, gzip-compressed
production builds. The comparison build is commit `151b308`; resource counts
include the toolbar and file menu once they finish loading. These are transfer
measurements, not a claim about real-world network latency.

| Metric | Before major upgrade | After migration |
| --- | ---: | ---: |
| Home startup JavaScript | 329,835 bytes / 10 requests | 353,379 bytes / 18 requests |
| Privacy route JavaScript | 128,308 bytes / 5 requests | 122,617 bytes / 6 requests |
| Shared CSS | 12,561 bytes | 13,833 bytes |
| Home font files (sum of file sizes) | 158,996 bytes / 4 requests | 36,932 bytes / 1 request |
| npm audit findings | 7 | 0 |

The initial upgraded build loaded 158,826 bytes of JavaScript on the privacy
route. Moving confirmation, tooltip, and notification providers behind the lazy
editor route reduced that to 122,617 bytes (about 23% less), without removing any
editor controls. Home JavaScript is about 7% larger than the pre-upgrade build;
the supported frameworks and complete functionality take priority over hiding
that increase. No eager all-vendor bundle or speculative chunk merging was added.

Live font inspection found that the 400, 500, and 600 DM Sans files were identical
but downloaded under separate URLs. The offline font maintenance script now
shares URLs for 62 duplicate sources across the catalog. All 149 face descriptors
and referenced font bytes were compared with the originals; weights, styles,
Unicode ranges, font choices, and old URLs remain intact. The generator applies
the same deduplication on refresh. Removing the unused Crimson Pro preload and
sharing DM Sans sources saves 122,064 bytes of font payload at startup. Bold DM
Sans and Crimson Pro still load correctly on demand. Font figures above are
file sizes for the observed requests; HTTP compression can change transfer bytes.

Vite builds completed in approximately 1–3 seconds on the review machine with
the Oxc plugin. This is an observed local range, not a controlled speedup claim.
The PDF module still exceeds Vite's default chunk warning threshold and remains
loaded only when PDF export is requested.

## Verification

- `npm install`, followed by a clean `npm ci --progress=false`, using npm 10.9.2:
  successful, with zero reported vulnerabilities and no peer override flags.
- Strict app/build typechecks, lint, 183 unit/component tests, production build,
  and the generated HTML/metadata/asset/source-map checks pass.
- Real Chromium workflows cover autosave/reload/undo, find/replace, formatting,
  version previews and guarded restore, library search, image upload, all six
  download formats, print, HTML sanitization, and cross-tab conflict copies.
- Chromium 153, Firefox 155, and WebKit 26.6 cover language changes, save/reload,
  keyboard table insertion, graphic editing, DOCX/ODT export and re-import, PDF
  downloads, responsive layouts, and dark mode.
- Before/after screenshots and computed layout checks cover the editor, table
  picker, graphic gallery, image dialog, file menu, version history, light/dark
  themes, the mobile toolbar, and legal pages. No material layout shifts remain.
- WCAG A/AA automated checks report no violations in the tested editor, dialog,
  mobile, and legal states. Widths 320, 375, 768, and 1440 have no horizontal page
  overflow. Manual screenshot review supplements the automated checks.
- All four legal URLs retain readable no-JavaScript HTML, metadata, language,
  and a single H1. An unknown URL serves the custom 404 artifact with status 404.
- The Vite development server and Oxc Fast Refresh preserve an edited document
  without reloading the page.
- Cloudflare successfully built commit `5388e35`; the deployed preview passed
  save/reload, all six downloads, mobile WCAG/overflow checks, German metadata,
  legal-route responses, sitemap/robots, and the real custom 404. The review bot
  timed out without providing findings. Hosting-injected analytics still causes
  CORS errors; there were no application JavaScript exceptions.

The three existing shadcn Fast Refresh lint warnings and lazy PDF chunk-size
warning remain visible. Firefox's scroll-linked positioning advisory reproduces
on both the pre-upgrade build and the upgraded build during the same editing
workflow; it is not suppressed in application code.

The legal contact and Cloudflare-injected analytics configuration remain the
operator-owned follow-ups described in the quality review. The dependency work
does not invent a contact or claim to change hosting account settings.
