# Set List

Build and perform ordered set lists of song notes in Obsidian.

A **song** is just a normal markdown or PDF note in your vault — the plugin renders it exactly as Obsidian would if you opened it directly, including any third-party rendering plugins (e.g. chord-sheet renderers).

A **set list** is a normal markdown note whose body is an ordered list of wikilinks to song notes, one per row. Blank rows and other text rows (headings, notes to yourself) are allowed between song rows and are preserved as-is. A set list note is identified by `type: SetList` in its frontmatter:

```markdown
---
type: SetList
---
ACT 1
[[Wow]]
[[Moving]]

ACT 2
[[Songs/Superheroes/My Girl|My Girl]]
[[Enola Gay.pdf]]
```

Opening a SetList note switches it into Edit view automatically. If Source Mode is enabled for the note, the raw markdown is shown instead.

## Commands

Available when the active note is a SetList note:

- **Set List: Switch to edit view** — build and maintain the set list.
- **Set List: Switch to stage view** — perform it live.

## Edit view

- **Add song** — pick any markdown or PDF file in the vault to append to the set list.
- **Remove** — remove a song from the list.
- Drag and drop a song row to reorder it.
- Click a song row to select it.
- **Enter stage view** — jumps into Stage view starting at the selected song (or the first song if none is selected).
- **Source mode** — drops back to the raw markdown note in Source Mode, e.g. to edit frontmatter or troubleshoot. Since the note stays in Source Mode, it won't auto-switch back to Edit view next time it's opened; use the command or reopen it in Live Preview/Reading view to get Edit view back.

## Stage view

Shows the current song full-screen, visually identical to opening the note directly. Minimal chrome, and all interaction with the rendered song (links, etc.) is blocked to avoid unintended edits mid-performance.

- Tap near the **left edge** — previous song.
- Tap near the **right edge** — next song.
- Scroll vertically — scroll within the current song, as usual.
- Long-press (anywhere) — return to Edit view.
- On desktop, arrow keys also move between songs.

## Development

```bash
npm install
npm run dev     # esbuild watch mode
npm run build   # type-check + production build
npm test        # vitest
```

Symlink the repo into a vault's `.obsidian/plugins/obsidian-set-list-plugin` and use a hot-reload plugin (e.g. [hot-reload](https://github.com/pjeby/hot-reload)) to pick up rebuilds automatically.
