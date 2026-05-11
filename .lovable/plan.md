I'm running as **Claude Sonnet 4.5** (Anthropic) inside Lovable.

## Goals

1. Headings adapt to light/dark like body text.
2. Font-size dropdown actually changes text size.
3. More compact top-bar (title inline with the File menu).
4. Higher-fidelity export output.
5. Open multiple files at once, each becoming its own document.

## Changes

### 1. Theme-adaptive headings (`src/index.css` + `RichTextEditor.tsx`)

Root cause: the editor uses Tailwind Typography's `prose prose-lg` class. `prose` sets heading colors via `--tw-prose-headings` to a fixed near-black, which doesn't follow our `--foreground` token when the theme flips. Body text inherits `color` from `.ProseMirror`, so it adapts; headings don't.

Fix:
- Add `dark:prose-invert` to the editor's class string so prose tokens flip in dark mode.
- Add an explicit override in `index.css` so all heading levels track our tokens regardless of prose:
  ```css
  .editor-content .ProseMirror :is(h1,h2,h3,h4,h5,h6) {
    color: hsl(var(--foreground));
  }
  ```
- Inline `style="color:#..."` set by the user via the color picker still wins (specificity of inline style), which is the desired behavior.

### 2. Repair font-size resizing (`RichTextEditor.tsx` + `EditorToolbar.tsx`)

Root cause: the toolbar calls `setMark('textStyle', { fontSize: value })`, but TipTap's `@tiptap/extension-text-style` does not declare a `fontSize` attribute by default, so the attribute is stripped and nothing renders.

Fix: extend `TextStyle` locally to register `fontSize`:
```ts
const TextStyleWithFontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
      },
    };
  },
});
```
Swap `TextStyle` for `TextStyleWithFontSize` in the extensions list. Keep the existing toolbar call site working. Verify the dropdown's `syncFontSize` effect already reads `editor.getAttributes('textStyle').fontSize` — it does.

### 3. Compact top-bar (`RichTextEditor.tsx` + `index.css`)

Today the header is two stacked rows (logo+menu, then the document-title input on its own row) plus a tall `min-height: clamp(88px, 9vw, 96px)`.

Fix:
- Move the document-title `<input>` to the same row as the brand and `FileMenu`, between them and the right-side actions, with `flex-1` so it stretches.
- Reduce the input's font-size to roughly `text-base font-medium` to fit a single 56px row.
- Remove the second wrapper `<div className="px-4 pb-3">` and drop `.app-header` min-height to a single `h-14` row.
- Keep the toolbar row below untouched.
- Ensure responsive collapse at small widths: title hides its label area gracefully on narrow viewports (it's an input, so it just shrinks; that's fine).

### 4. Export hardening — output fidelity (`FileMenu.tsx` + helpers)

The export helpers convert the editor HTML into blocks and then serialize. Focus areas:

- **Headings**: ensure `h1/h2/h3` map to correct DOCX/ODT heading styles and PDF font sizes (review `buildDocxBlob`, `buildOdtContentXml`, `buildPdfBlob`). Add levels `h4–h6` mapping fallback.
- **Inline marks**: preserve `bold`, `italic`, `underline`, `strike`, `superscript`, `subscript`, inline `color`, `highlight`, and `font-size` across DOCX/ODT/RTF (currently font-size and color are often dropped). For DOCX: emit `<w:sz>`, `<w:color>`, `<w:highlight>`. For ODT: emit per-span automatic styles. For RTF: `\fs`, `\cf`, `\highlight`.
- **Alignment**: pass through `text-align` from the paragraph style on h/p elements into DOCX `<w:jc>` and ODT `fo:text-align`.
- **Lists**: keep nested `<ul><ol>` levels; ensure ordered/unordered distinction survives in DOCX (numId) and ODT (`text:list-style`).
- **Tables**: preserve cell text, header row, and basic borders in DOCX/ODT (already partially supported — verify against `extractBlocksFromHtml` output and extend if missing).
- **Images**: keep base64 data-URI images by embedding them as binary parts in DOCX `word/media/` and ODT `Pictures/` with manifest entries (currently they may be skipped). PDF already embeds via `buildPdfBlob`.
- **Links**: emit DOCX hyperlink relationships and ODT `text:a`.
- **HTML export**: already solid; only ensure inline `font-size` styles ride along (they already do because we serialize `editor.getHTML()`).

These are incremental upgrades to the existing builders, not a rewrite.

### 5. Multi-file import (`FileMenu.tsx`)

Today `handleOpenFile` sets `input.accept` but not `input.multiple`. The handler reads `files?.[0]` only.

Fix:
- Add `input.multiple = true`.
- Iterate `Array.from(files)` sequentially:
  1. For the first file: behave like today — load it as the active document.
  2. For subsequent files: parse with `importDocument`, then call `upsertLibraryDocument` to add each as its own library entry (without switching away from the active doc).
- Show a single summary toast: `Imported N files (M failed)`.
- Cap at 20 files per batch and the existing 20 MB per file from `DocumentImporter` to bound work.

## Technical details

```text
src/
  components/Editor/
    RichTextEditor.tsx     # TextStyleWithFontSize, dark:prose-invert, header layout
    EditorToolbar.tsx      # (no change needed once TextStyle carries fontSize)
    FileMenu.tsx           # multi-file open; export builder upgrades
  index.css                # heading color override; remove app-header min-height
```

Out of scope (not requested): the agent_security warnings about console.error verbosity and the sidebar cookie attributes; the security memory; backend/Cloud changes.

## Verification

- Toggle light/dark with H1/H2/H3 present → headings remain readable in both.
- Select text, change font size to 24/32/48 → size visibly applied and persists after save/reload.
- Header is a single 56px row with title centered between menu and actions; no second stacked row.
- Export a doc containing headings, bold/italic/underline, a colored span, a list, a table, an image, and a link to DOCX, ODT, RTF, PDF, HTML, TXT → open in Word / LibreOffice / a PDF reader and confirm formatting carries over.
- Pick 3 files in Open dialog → first opens, other two appear in the library.
