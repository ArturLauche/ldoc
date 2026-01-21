# LWrite

LWrite is a browser-based rich text editor built with React and TipTap. It provides a focused writing experience with theming, autosave, version snapshots, import/export utilities, and lightweight document stats. The app runs entirely in the browser and stores documents locally in `localStorage`.【F:src/components/Editor/RichTextEditor.tsx†L25-L244】

## Features

- **Rich text editing** with headings, lists, links, highlights, alignment, inline styles, and images powered by TipTap and its extensions.【F:src/components/Editor/RichTextEditor.tsx†L6-L113】
- **Autosave + manual save** with visual save status indicators and keyboard shortcuts (`⌘/Ctrl+S`).【F:src/components/Editor/RichTextEditor.tsx†L25-L194】
- **Version history** with up to 20 snapshots, preview, restore, and delete actions.【F:src/components/Editor/VersionHistory.tsx†L12-L167】
- **Import documents** from TXT, HTML, RTF, DOCX, ODT/OTT, and FODT formats.【F:src/components/Editor/DocumentImporter.ts†L3-L183】
- **Export documents** to TXT, HTML, RTF, DOCX, ODT, and PDF formats.【F:src/components/Editor/FileMenu.tsx†L95-L307】
- **Word/character counts** and document naming for quick status at a glance.【F:src/components/Editor/RichTextEditor.tsx†L57-L244】
- **Light/dark/system themes** with a quick toggle in the header.【F:src/components/Editor/RichTextEditor.tsx†L63-L187】

## Tech stack

- **Vite + React + TypeScript** for the client application.【F:package.json†L1-L19】
- **TipTap** for rich text editing.【F:src/components/Editor/RichTextEditor.tsx†L1-L13】
- **Tailwind CSS + shadcn/ui** for styling and UI primitives.【F:package.json†L45-L88】

## Getting started

### Prerequisites

- Node.js (recommended: install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- npm (ships with Node.js)

### Installation

```sh
npm install
```

### Run locally

```sh
npm run dev
```

Then open the local URL printed by Vite (typically http://localhost:5173).

## Scripts

```sh
npm run dev      # Start the dev server
npm run build    # Build for production
npm run preview  # Preview the production build
npm run lint     # Run ESLint
```

## Project structure

```text
src/
  components/Editor/   # Editor UI, toolbar, menus, import/export, version history
  pages/               # Route-level pages (Index mounts the editor)
```

## Data storage

Documents and version snapshots are stored in the browser's `localStorage`. Clearing site data or using a different browser/device will reset stored documents and history.【F:src/components/Editor/RichTextEditor.tsx†L25-L194】【F:src/components/Editor/VersionHistory.tsx†L12-L167】

## License

This project is currently unlicensed. Add a license if you plan to distribute it.
