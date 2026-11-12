# Browsing the repository

The **Repository** tab, in the bar above the board, shows the whole repository of the project, not only what a
ticket changed. Use it to read a file before you write a ticket, or to look at code a review does not show.

## What you see

- **At the top**: the branch shown, then its latest commit: who made it, its message, its short id and when. The
  short commit id opens the commit on GitHub. **Refresh** reads the branch again after someone pushed to it.
- **On the left**: the folders and files. Click a folder to open it; click a file to show it.
- **On the right**: the file, with line numbers and colours for its language. Images show as images. A binary file, or one larger than 1 MB, shows only its size: **Open on GitHub** opens it
  there. A folder shows its contents in three columns, folders first, with their sizes, then its README rendered
  under them when it has one (as on GitHub).
- **The path above the file**: click a folder in it to go back up.

## Another branch

The tab opens on the project's base branch. Click its name, top left, to list the repository's branches (the base
branch first), type a few letters to filter them, and click one: the file you were reading stays open, as it is on
that branch. A tag or a commit id works too: type it, then click **Show "…"**. Pick the base branch again to come
back. Back in your browser returns to the branch you had before.

## Markdown files

A Markdown file (a README, a doc) opens rendered, as GitHub shows it: headings, tables, diagrams and images.
**Source** above it shows the text with line numbers; the next file you open is rendered again.

- A link to another file of the repository opens that file here. Back returns to the page you came from.
- A link to a file the branch does not have opens GitHub instead.
- Images stored in the repository load from it, up to 10 MB each.

## Find a file

Type a few letters of its name in **Go to file** (or press `/`). The letters need to be in order but not next to
each other: `pkgjson` finds `package.json`. Files whose name holds all the letters come first. Press Escape to clear
the box and go back to the folders.

In a very large repository (more than 100,000 files), GitHub sends the folders one at a time: the search then only
covers the folders you have opened.

## Good to know

- The address in your browser keeps the file you look at: reload the page, or send yourself the link, and the same
  file opens.
- Union reads the files from GitHub with the project's token or GitHub App. Nothing is cloned and no agent runs, so
  it costs no Claude usage.
- A ticket's branch is in the list only once it has been pushed to GitHub.
