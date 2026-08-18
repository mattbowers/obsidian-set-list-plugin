# Set List

Build and perform ordered set lists of song notes in Obsidian, optimized for touch use in on-stage environments.

A **song** is just a normal markdown or PDF note in your vault — the plugin renders it exactly as Obsidian would if you opened it directly, including any third-party rendering plugins (e.g. chord-sheet renderers).

A **set list** is a normal markdown note whose body is an ordered list of wikilinks to song notes, one per row. Blank rows and other text rows (headings, notes to yourself) are allowed between song rows and are preserved as-is. A set list note is identified by `type: SetList` in its frontmatter:

```markdown
---
type: SetList
band: The Wow Band
---
ACT 1
[[Wow]]
[[Moving]]

ACT 2
[[Songs/Superheroes/My Girl|My Girl]]
[[Enola Gay.pdf]]
```

The optional `band` property, if present, unlocks a couple of extra conveniences (see below) — it isn't required.

Opening a SetList note switches it into Edit view automatically. If Source Mode is enabled for the note, the raw markdown is shown instead.

Click the **New set list** icon in the ribbon (or run the command of the same name) to create a new, empty set list note — it's placed wherever Obsidian's own "New note" would put it, and opens straight into Edit view.

## Commands

Available whenever the active note/view is a SetList (name/status varies slightly by command):

- **Set List: New set list** — same as the ribbon icon.
- **Set List: Switch to edit view** / **Switch to stage view** — switch between the two views. Switching to Stage view starts at the currently selected song (or the first song if none is selected), matching Edit view's own "Enter stage view" button.
- **Set List: Source mode** — drop back to the raw markdown note.
- **Set List: Add song** / **Replace selected song** / **Remove selected song** / **Open song as new tab** — mirror the Edit view toolbar buttons; only listed when there's an active Edit view (and, where relevant, a valid song selection).
- **Set List: Tag all songs with band** — only listed when the set list has a `band` property.
- **Set List: Next song** / **Previous song** — only listed while Stage view is active.

## Edit view

The toolbar is grouped into song actions (left) and set-list-level actions (right):

- **Add song** — pick any markdown or PDF file in the vault (other set lists are excluded) to append to the set list. Pressing Enter or clicking a result adds it and keeps the picker open, cleared and ready for the next one, so you can add several songs in quick succession; close the picker when done. Songs already in the set list are shown dimmed (but can still be picked again, e.g. for an encore). If the set list has a `band` property, a toggle — on by default — filters the picker to songs already tagged with it.
- **Replace selected song** — swap the selected song for a different one, in place, via the same picker.
- **Remove selected song** — remove the selected song from the list.
- **Enter stage view** — jumps into Stage view starting at the selected song (or the first song if none is selected).
- **Open song as new tab** — opens the selected song's own note in a new tab, e.g. to edit it, or keep it open alongside the set list.
- **Tag all songs with band** *(only if the set list has a `band` property)* — adds a tag for it to every song's frontmatter, skipping any song that already has it.
- **Source mode** — drops back to the raw markdown note in Source Mode, e.g. to edit frontmatter or troubleshoot. Since the note stays in Source Mode, it won't auto-switch back to Edit view next time it's opened; use the command or reopen it in Live Preview/Reading view to get Edit view back.

Other interactions:

- Click a song row to select it.
- Double-click/double-tap a song row to select it and jump straight into Stage view.
- Drag and drop a song row to reorder it — the dragged song ends up selected at its new position.

Toolbar icons and song rows are sized for touch use (e.g. rehearsing or performing from a tablet), rather than a compact desktop layout.

## Stage view

Shows the current song full-screen, visually identical to opening the note directly. Minimal chrome, and all interaction with the rendered song (links, etc.) is blocked to avoid unintended edits mid-performance.

- Swipe left (anywhere) — next song. Swipe right — previous song. A ring grows at the touch point as the swipe is recognized, so you can see it register before releasing.
- Scroll vertically — scroll within the current song, as usual.
- Long-press (anywhere) — return to Edit view, back to the song that was showing. A ring fills in over the hold duration as a visual cue.
- On desktop, arrow keys also move between songs.

Returning to Edit view — however you do it (long-press, the command, or the pane's back button) — reselects whatever song was last shown in Stage view.

## Development

```bash
npm install
npm run dev     # esbuild watch mode
npm run build   # type-check + production build
npm test        # vitest
```

Symlink the repo into a vault's `.obsidian/plugins/obsidian-set-list-plugin` and use a hot-reload plugin (e.g. [hot-reload](https://github.com/pjeby/hot-reload)) to pick up rebuilds automatically.
