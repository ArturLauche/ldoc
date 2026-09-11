# PR #52 review follow-up

Reviewed the owner review and all seven Kilo inline findings against `84716df`.
Nine findings were actionable; the reported TypeScript build failure did not
reproduce with the pinned toolchain. CodeRabbit did not review the code because
of its file-count/usage limits.

| Finding | Assessment and implemented response |
| --- | --- |
| Accepted sizes exceed localStorage capacity | Confirmed. Documents, library, and history now use native IndexedDB transactions. The existing 20 MB document and 10 MB image limits remain. Preferences stay in localStorage. |
| Partial current-record migration creates duplicates | Confirmed. Id-less sources receive a deterministic SHA-256 identity; current record and library now commit atomically. Original legacy localStorage records remain available for recovery. |
| ODT/OTT checks happen after inflation | Confirmed. Read archive entries sequentially through an actual-byte budget before materializing XML or base64. Apply a shared 20 MB expanded budget and 10 MB per embedded image. |
| DOCX has no expanded-size protection | Confirmed. A post-conversion assertion would be too late. The shared bounded archive reader verifies every entry, then supplies Mammoth a STORE archive containing only the verified bytes. |
| Library backup depends on a successful save | Confirmed. Backup reads are independent of writes. A differing live draft is included alongside the saved record under a fresh ID, preserving both sides of a conflict. |
| History migration runs during render | Confirmed. Session loading explicitly performs migration; history reads are separate. The dialog loads after commit, with a loading state and cancellation on unmount. |
| Unlayered toolbar borders override utilities | Confirmed. Bar styles now live in the components layer, so Tailwind utilities can intentionally override them. |
| Incorrect previous tailwind-merge version | Confirmed against the comparison lockfile: corrected 2.6.0 to 2.6.1. |
| Abort/cancel can hide an image-size warning | Confirmed. Cancel before abort, and prevent cleanup rejection from replacing the known size outcome. |
| Static-page escape map causes TS7053 | Not reproduced: the original strict app/build typechecks pass with TypeScript 6.0.3. No widening assertion was added merely to satisfy the review. |

The storage fix follows [MDN's storage guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): IndexedDB is appropriate for larger document data. It does not remove device quotas or browser eviction. A save is acknowledged only after transaction completion. Competing saves compare the persisted baseline inside the same transaction, while BroadcastChannel and focus checks provide prompt conflict notices. Notifications are optional and cannot turn a committed save into an apparent failure.

The archive reader uses JSZip's [documented streaming API](https://stuk.github.io/jszip/documentation/api_zipobject/internal_stream.html). It counts actual emitted bytes instead of trusting declared ZIP sizes and pauses immediately at the budget. XML space repetition also has a cumulative bound, because a small FODT file can otherwise request an enormous string without ZIP compression.

## Verification

- Final local validation: 202 unit/component tests across 31 files, strict app
  and build typechecks, lint (three existing Fast Refresh warnings), and
  production output checks pass. A clean npm 10.9.2 install and the complete
  peer graph pass; npm audit reports zero known advisories.
- All five production browser scenarios are verified in Chromium, Firefox,
  and WebKit (15 checks). Exact 20 MB paragraph documents complete the tested
  import/save/reload flow in roughly 29–38 seconds with Playwright tracing.
- The unit/component suite covers transaction rollback, simultaneous saves,
  unavailable storage, stable migration retries, failed-save backups, rendering
  without history access, edits during pending writes, and editor destruction.
- Compact ODT/OTT/DOCX fixtures exercise expanded limits, cumulative images,
  individual image limits, and XML repetition. Export tests cover rejecting
  stream cancellation without losing the size warning.
- Checked-in Playwright tests exercise the production build: accepted 10 MB
  image and 20 MB document save/reload, navigation-time flushing, conflicting
  draft backups, and DOCX/ODT export/import round-trips. They can run in Chromium,
  Firefox, and WebKit.
- GitHub Actions now performs clean npm installation, the peer-graph check,
  `npm run validate`, `npm run audit`, and Chromium persistence tests on each PR.
  It uses read-only repository permissions and pinned action revisions.

The 20 MB browser fixture contains normal paragraphs. An additional stress
probe using one 20-million-character word exceeded 90 seconds in WebKit. The paragraph fixture completed import, save, and reload in about
24 seconds in the same engine without tracing. Storage capacity tests do not
establish interactive performance for every document shape; extreme single-word
layout remains a limitation. No content is truncated to make the tests pass.

## Measured sanitization improvement

URI normalization previously allocated multiple per-character arrays for every
embedded data URL. A replacement regex removes exactly the same ASCII controls
and whitespace without those arrays. Executable-URL, Unicode-link, and embedded
image regression checks preserve the security behavior.

A local Node 24.21.0 microbenchmark used the 13,981,038-character data URL of an
accepted 10 MB image, three calls per implementation, with explicit GC before
each call. Median normalization time fell from 1,568 ms to 32.6 ms. Measured heap
growth after each old call was about 359–473 MiB, versus under 0.02 MiB for the
replacement. These measurements cover this helper, not total import or save
latency; the full browser tests also check decoded image content after reload.

## Storage compatibility

The existing keys and JSON envelopes are retained inside the IndexedDB store.
Reads fall back to legacy localStorage only when that key has no IndexedDB
record. Mutations copy the relevant legacy records in their transaction; null
tombstones prevent deleted records from reappearing. Original localStorage data
is retained as recovery material and is not updated by the new writer. The
20-version cap, sanitization boundary, replacement confirmations, safety copies,
export formats, and library backup format remain intact. UI editing waits for
initial loading and document replacement; asynchronous saves do not mark newer
keystrokes as saved.

The PR's incorrect `opencode` author/committer identity is corrected to the
repository owner's existing verified identity, Artur Lauche with the GitHub
noreply address. Only this PR branch's commits are rewritten; `main` is unchanged.
