# Browsing the repository

The **Repository** tab, in the bar above the board, shows the whole repository of the project, not only what a
ticket changed. Use it to read a file before you write a ticket, or to look at code a review does not show.

## What you see

- **At the top**: the branch shown (the project's base branch), its latest commit, who made it and when. The short
  commit id opens the commit on GitHub. **Refresh** reads the branch again after someone pushed to it.
- **On the left**: the folders and files. Click a folder to open it; click a file to show it.
- **On the right**: the file, with line numbers and colours for its language. Markdown shows as source for now.
  Images show as images. A binary file, or one larger than 1 MB, shows only its size: **Open on GitHub** opens it
  there. A folder shows its contents with their sizes.
- **The path above the file**: click a folder in it to go back up.

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
- A branch an agent is still working on shows here only once it has been pushed to GitHub.
