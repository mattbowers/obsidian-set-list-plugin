# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a functionally complete Obsidian community plugin (v1.0.0) implementing the design in `Obsidian Set List Plugin.md` — read that file for the original product concepts (Song, Set List, Edit view, Stage view). One known gap remains: Stage view has an unresolved full-screen layout issue on some songs/devices, not yet diagnosed.

## Commands

- `npm run dev` — esbuild watch mode, rebuilds `main.js` on change
- `npm run build` — type-check (`tsc -noEmit`) then production esbuild bundle
- `npm run check` — type-check only
- `npm test` — run the vitest suite (pure-logic tests only; view/rendering/gesture wiring is verified manually in Obsidian, not unit tested)

### Local dev loop

Symlink this repo into a test vault's plugin folder, e.g. `<vault>/.obsidian/plugins/obsidian-set-list-plugin`, and install the community `hot-reload` plugin in that vault — it picks up a fresh `main.js` after each build automatically. Sample song/set-list files for manual testing live outside this repo at `/Users/matthew/Documents/Vaults/Testbed`; the plugin also renders through the vault's separately-installed `chord-sheets-mb` plugin for some songs, which this plugin has no code dependency on but which its Stage/Edit views' DOM structure (`.markdown-reading-view` / `.markdown-preview-view` / `.markdown-rendered`) must stay compatible with for correct visual rendering.

Each build bakes a `__BUILD_TIME__` timestamp (via esbuild `define`) into the bundle; both views render a small "vX.Y.Z · built HH:MM:SS" badge (`src/ui/buildBadge.ts`) so you can visually confirm a rebuild reached a device (useful on mobile/tablet, where devtools aren't handy).

## Architecture

- `src/main.ts` — plugin entry: registers the two views, the two switch-view commands (gated by `isSetListFile`), and installs `sidebarSwipeGuard`.
- `src/setlist/` — pure data model, no Obsidian view/UI code:
  - `types.ts` — `SongEntry` / `TextEntry` / `SetListEntry` union, `ParsedSetList { preamble, entries }`.
  - `parser.ts` — `isSetListFile` (frontmatter `type: SetList`, case/whitespace-tolerant), `parseSetList` (splits frontmatter as an untouched preamble, classifies each body line as song/text by cross-referencing `CachedMetadata.links[].position.start.line`, resolves links via an injected callback).
  - `serializer.ts` — `serializeSetList`, the exact inverse of the parser (preamble + entries' raw lines).
  - `mutations.ts` — pure `addSong` / `removeSong` / `reorder` over a `ParsedSetList`.
  - `persist.ts` — writes a mutated `ParsedSetList` back via `Vault.process`.
  - `navigation.ts` — `findFirstSongIndex` / `findNextSongIndex` / `findPrevSongIndex`, skipping non-song entries.
- `src/views/`:
  - `viewTypes.ts` — the two view-type string constants (kept separate to avoid a circular import between the two view files).
  - `BaseSetListView.ts` — shared `FileView` base: parses on load, re-parses on `metadataCache.on("changed", ...)` (not `vault.on("modify")` — the latter fires before the metadata cache re-indexes, which caused a stale-render bug).
  - `SetListEditView.ts` — toolbar (add/remove/reorder via drag-and-drop with insertion-mark indicators/enter stage view), a live preview pane for the selected song (reuses `renderSong`).
  - `SetListStageView.ts` — persistent DOM scaffold (built once in `initScaffold`, re-rendered content-only on navigation) layering a gesture-capture overlay over the rendered song; `currentIndex` persisted via `getState`/`setState`.
- `src/render/renderSong.ts` — renders a song file through Obsidian's real `MarkdownRenderer.render` pipeline (so third-party post-processors like `chord-sheets-mb` run normally); non-md files (e.g. PDFs) render via a synthetic `![[path]]` embed rather than a hand-rolled viewer.
- `src/gestures/`:
  - `StageGestureController.ts` — framework-agnostic pointer-event state machine for Stage view: a quick tap near the left/right edge of the overlay navigates prev/next, a stationary long-press exits to Edit view. Classification happens on `pointerup`; `pointercancel` is also treated as a completed tap *only* if no real movement was observed first via `onPointerMove` — this specifically handles Obsidian's own edge-swipe gesture recognizer stealing a touch near the screen edge (which fires a cancel, not an up) without misfiring on ordinary vertical scrolls that also get resolved via a cancel.
  - `sidebarSwipeGuard.ts` — wraps `app.workspace.trigger` to swallow the internal `"swipe"` event (Obsidian's own mechanism for opening/closing sidebars on mobile) while Stage view is active. This is a separate, lower-level mitigation from `StageGestureController` and exists because Obsidian's sidebar-swipe detection isn't a normal bubbling DOM listener `stopPropagation()` can intercept.
- `src/ui/`:
  - `SongPickerModal.ts` — `FuzzySuggestModal<TFile>` over markdown + PDF vault files.
  - `buildBadge.ts` — the build-time verification badge described above.
- `src/__tests__/` — vitest fixtures for the parser/serializer round-trip, mutations, navigation skip-logic, and gesture classification, modeled on real Testbed sample-file patterns (aliased links, `.pdf` links, unresolved links, interleaved text/blank rows, frontmatter casing).

## Design notes worth preserving

- Views are only reachable via the two explicit commands (`checkCallback` gated on `isSetListFile`) — there's no hijacking of the default view for all `.md` files, so normal notes and Source Mode are untouched.
- `parseSetList`/`resolveLink` take an injected callback rather than calling `metadataCache.getFirstLinkpathDest` directly, keeping the whole `setlist/` module testable without a real Obsidian runtime (the `obsidian` npm package is types-only, so `import type { TFile } from "obsidian"` is safe in tests).
- Stage view's gesture overlay intentionally intercepts every pointer event over the rendered song (so a mistimed tap during a performance can't hit a real link) — only vertical scroll passes through, via CSS `touch-action: pan-y`, not JS.
