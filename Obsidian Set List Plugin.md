Write a plan for implementing a Set List Plugin for Obsidian. Organise the work into a series of stages where we can verify the results at each stage, make improvements, before moving on to the next. 

## Concepts
### Song
Songs are represented by normal markdown or pdf notes in the vault. I often us chord-sheet-mb plugin for rendering chord chart markdown, but this will operate independently of the set list plugin. When the set list plugin displays a song the presentation should be visually identical to opening that markdown note directly in Obsidian.

### Set List
A set list is an ordered list of songs for performance. The set list is modelled as a Obsidian markdown document. A set list is just a markdown note with a list of links to other notes. Any valid Obsidian markdown and frontmatter may be present in the file, but the following notations have meaning:

- A wikilink represents a link to a song as part of the set list
- Song links appear on there own row
- The order of song rows is the order of the set list
- Blank rows and other text rows are allowed

Set list note type is marked by type: SetList in the frontmatter

### Plugin UI
When a SetList typed note is loaded, the following commands are provided by the plugin:
#### Set List: Switch to edit view
Switches the view to edit view
#### Set List: Switch to stage view
Switches the view to live view

If the user enables Source Mode, then the raw markdown is visible.
### Edit view
This view is intended for building and maintaining a set list before a performance - usually performed at a desktop, but sometimes on mobile devices.

When in edit view, the following actions are supported through GUI buttons in a toolbar:

- add a song to the set by picking from available files in the vault
- remove a song from the set
- enter stage view with the current song in the set

In addition, the user can reorder the list of songs by drag-and-drop.

### Stage view
This view is intended to be activated for the performance itself. It needs to minimise the visual clutter to allow the user to focus on performing the songs. There are minimal interactions supported. All other interactions should be blocked to avoid unintended edits during the show.

In stage view, the current song is displayed full screen and should be visually identical to opening that markdown note directly in Obsidian.

When in stage view, the following actions are supported:

- swipe-left gesture to go to the next song in the set
- swipe-right gesture to go back to the previous song in the set
- vertical scrolling gestures allow scrolling within the loaded song note in the usual way
- long-press gesture to go back to edit view
## Other requirements
- Plugin should work on desktop and mobile platforms

## Resources
- `/Users/matthew/Documents/Vaults/Testbed` contains sample song and set list files.