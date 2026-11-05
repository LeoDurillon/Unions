# Plan: a project's Repository tab

Status: steps 1 and 2 built (2026-11-05, branch `repository-view`). Checked against GitHub on both live projects
(an App and a token; the Senova tree, 4,451 entries, in one call, under a second; files read once, then from the
cache) and in headless Chromium on 3100 (tab, tree, highlighting, the URL kept on reload, go to file, folders; no
write tried). Images are shown already (step 3 had them). Left: steps 3 to 5; a file in the URL under a folder a
truncated tree has not read yet shows "Nothing at this path" until that folder is opened.

## Idea

Union shows only what changed: a ticket's or a pull request's diff. Reading a file the diff does not touch, or seeing
how the repository is laid out before writing a ticket, means leaving for GitHub or an editor. A **Repository** tab in
the project bar (after Pull requests, before Usage) shows the whole repository at a branch or commit: its folders on
the left, the picked file on the right, highlighted, with line numbers and links to a line.

## Where the files come from

**From GitHub, read by the web server** (recommended for v1). AGENTS.md lets the web read what the UI needs answered
right away through `OnboardingGitHub`, and this is that: no command, no worker, no Docker, no clone.

- The tree: `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1`, one call for the whole repository (paths, modes, sizes,
  blob shas). GitHub returns at most 100,000 entries or 7 MB and sets `truncated`; then the server falls back to
  one non-recursive tree call per opened folder.
- A file: `GET /repos/{o}/{r}/git/blobs/{sha}` (base64, up to 100 MB). A blob's sha names its content, so its answer
  never changes: cached on the server (a small LRU by sha, bounded in bytes) and in React Query with
  `staleTime: Infinity`.
- The ref is resolved to a commit sha first (`GET /commits/{ref}`, one call), and the tree and files are read at that
  sha, so a push during the visit does not mix two versions. The page says which commit it shows and offers
  **Refresh** when the branch moved.

The cost is one or two GitHub calls to open the tab and one per new file, well inside the token's or the App's
5,000 calls an hour.

**Rejected for v1: a mirror on the host.** The worker could keep a bare clone per project (`git clone --mirror`,
fetched on demand) and answer with `git ls-tree` / `git show`. It gives content search (`git grep`), history and
blame without GitHub's limits, but needs a command round trip for each read (the web may not run git on a
repository Union pushes to), disk per project and a fetch policy. It becomes worth it with search (step 5).

## What the tab shows

- **Header**: the ref picker (the project's base branch by default; any branch, through the existing
  `branch-picker.tsx`; a ticket's branch or a pull request's head listed by name), the commit it resolved to (short
  sha, message, when, a link to GitHub), Refresh.
- **Left**: the folder tree, folders first, sorted by name, every folder folded except the root; a filter box above
  it that matches paths as you type (client-side over the tree, subsequence match like an editor's "go to file").
  `/` focuses it, like the board's search.
- **Right**: the picked file.
  - Text: highlighted with `lib/highlight.ts` (`languageFor`), line numbers, a click on a number selects the line
    (shift-click a range) and puts it in the URL; **Copy path**, **Copy link**, **Open on GitHub**, **Raw**.
  - Markdown: rendered (`markdown.tsx`, Mermaid included) with a Source / Rendered switch; a folder's `README.md`
    shows under its listing, as on GitHub.
  - Images (png, jpg, gif, svg, webp): shown from the blob as a data URL (SVG as an image, never inline markup).
  - Binary, or larger than 1 MB: its size and **Open on GitHub**, no content. Highlighting stops after 5,000 lines
    (the rest plain), so a generated file does not freeze the page.
- **A folder** picked: its entries with their sizes, then its README.
- **Empty repository** or no GitHub access: what is missing and the way to fix it (the project bar's banner already
  covers access).

### In the URL

`?view=repository&ref=<branch or sha>&path=<file>&lines=12-30`. The project view is local state in
`workspace.tsx` today; `repository` is the first one that needs to survive a reload and Back, like `?review-pr=` for
the Pull requests view. Its own small hook (`lib/repository-url.ts`), the same way `review-url.ts` does it.

### Links in from elsewhere (step 4)

- The review page's open file: **View file** opens it in the Repository tab at the reviewed head commit (a ticket's
  branch, a pull request's `headSha`), so the lines around the change are one click away.
- `diff-link-code.tsx`: a `path:line` that names a file outside the diff (in an explanation, a report, an agent's
  answer) opens it in the Repository tab instead of doing nothing.
- A ticket's Overview: **Browse branch** once its branch is on GitHub.

## Server

- `OnboardingGitHub` gains `resolveRef`, `getTree` (`recursive`, with the `truncated` fallback) and `getBlob`, in a
  new `apps/web/src/github-repository.ts` (the reads and their shapes) rather than growing `github-repo.ts`.
- Routes in a new `apps/web/src/routes/repository.ts`:
  - `GET /api/projects/:projectId/repository/ref?name=` → `{ sha, message, author, date, branch | null }`
  - `GET /api/projects/:projectId/repository/tree?sha=&path=` → `{ entries: { path, type: 'file' | 'dir' | 'link' |
    'submodule', size, sha }[], truncated }`
  - `GET /api/projects/:projectId/repository/blob?sha=&path=` → `{ kind: 'text' | 'image' | 'binary' | 'too-large',
    text?, dataUrl?, size }`; the path is only used to guess the kind and the image type.
- Credentials through `projectGitHubAuth` and `@union/core/github-client`, as every other web read; nothing is
  stored, no migration, no event.
- Text or binary: a NUL byte in the first 8 KB, or invalid UTF-8, means binary (a pure function in core,
  `blob-kind.ts`, tested).
- A submodule shows as an entry that links to its repository on GitHub; a symlink shows its target.

## Client

New folder `components/repository/`, split from the start for the 300-line and 10-import limits:

- `repository-page.tsx`: header, tree and viewer side by side; reads the URL hook.
- `ref-header.tsx`: the ref picker, the commit line, Refresh.
- `repo-tree.tsx` and `repo-tree-filter.tsx`: the folders, the filter box; the tree building reuses
  `lib/file-tree.ts` (generalized from the diff's `DiffFileSummary` to a plain path list, if its shape allows; else a
  sibling).
- `file-viewer.tsx`, `text-view.tsx`, `markdown-view.tsx`, `image-view.tsx`: one per kind.
- `use-repository.ts`: the three queries (ref, tree, blob) and the selection.
- `project-bar.tsx`, `project-body.tsx`, `workspace.tsx`: the new view.

## Steps

1. Server reads and routes, with `fake` GitHub tests (tree, truncated fallback, blob kinds, the cache).
2. The tab: ref at the base branch, tree, text files highlighted, URL state. Usable on its own.
3. Ref picker, Markdown and images, folder READMEs, line selection and Copy link.
4. Links in from the review page, `diff-link-code` and the ticket's Overview.
5. (Later) Search in the file contents: the host mirror above and `git grep`, through a command the worker answers;
   or GitHub code search, which only searches the default branch.

Each step: `docs/architecture/web.md` (routes, the new reads), the user guide (a section on the Repository tab in
`documentation/`, likely its own page linked from the README, with the review page's **View file** in
`reviewing.md`), `bun run map`, `bun run check`, and a look in headless Chromium through `scripts/ui-check/` on a
real project (reads only).

## Decisions to confirm

- **D1. GitHub reads, no clone, for v1.** Search in contents waits for step 5. Alternative: start with the host
  mirror and get search at once, at the cost of the command round trip and disk.
- **D2. Read only.** No editing, no "create a ticket from these lines" in v1. The second would be a cheap
  follow-up: selected lines become a quote in a New ticket's description, or questions for an investigation.
- **D3. A tab of the project**, not a tab of the ticket panel. A ticket's own branch is reached through the ref
  picker or **Browse branch**; a tab inside the narrow panel would be too cramped for a tree and a file.
- **D4. Limits**: 1 MB per file shown, 5,000 lines highlighted, the 100,000-entry tree fallback. To adjust after
  trying it on the largest project.
- **D5. Branches that exist only in a ticket's container** (never pushed) are not listed: the tab shows what
  GitHub has. Reading a container's workspace would mean Docker, which the web never touches.

## Ideas

- "Ask about this file": an investigation started with the file and selected lines attached.
- History of a file (`GET /commits?path=`) and blame (GraphQL `blame`), in a side panel.
- Compare two refs: the review page's diff for any two branches, without a pull request.
