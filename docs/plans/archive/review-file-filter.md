# Plan: filter the review's files, and a Code only switch

Status: built (2026-11-09, branch `review-file-filter`). Checked against a copy of the live database in headless
Chromium (a 38-file ticket: the filter, `/`, Esc, Code only kept on reload, `j` over the listed files, No file
matches and Clear, no write) and on the API (a ticket's commit, a pull request's review). One change from the plan:
the box keeps the paths holding every typed word (as GitHub's filter does), not the letters in order: without
ranking, the letters in order kept too much ("spec" kept 14 files of 38, words keep 4).

## Idea

A big change lists dozens of files on the left of the review page, and the reviewer looks for one by scrolling.
Two controls above the file list narrow it:

- **A filter box**: words of a path. Only the files whose path holds every word stay listed.
- **Code only**: hides every file Union does not count as code, so the reviewer reads what the change actually
  does first.

Both work on every view that lists files with `FileList`: a ticket's review, a pull request's review, one commit
or the change since the last review (`commit-diff.tsx`).

## What "code" means

Union already decides it in one place: the change size (`packages/core/src/change-size.ts`, `measureChange`). A
file is code when it is not binary and does not match the project's size patterns (`sizeIgnoreOf(config)`: the
project's own, else `DEFAULT_SIZE_IGNORE`: tests, lock files, `migrations/`, `*.md`). Code only uses the same rule,
so what it shows is what counts against the size budget, and the patterns the user edits in Settings → Size change
both.

This is not the review's ignore rule (`reviewIgnore` and `hideLockFiles`, the folded "ignored files" at the end of
the list): that one hides noise from the review; this one separates code from tests, docs and generated files. A
file can be ignored and still code (a project pattern on a generated client), or not ignored and not code (a test).
Code only hides the non-code files from both the main list and the ignored section.

Tests are hidden by Code only, since Union does not count them as code. See the open question below.

## Server

- `packages/core/src/change-size.ts`: export `isCodeFile(file: { path: string; binary?: boolean }, ignore)`, and
  use it in `measureChange` so both stay one rule. Test it in `change-size.test.ts`.
- `DiffFileSummary` (`apps/web/src/api-types.ts`) gains `code: boolean`, next to `ignored`.
- Set it where `ignored` is set: `routes/review/review.ts`, `routes/tickets/ticket-commits.ts`,
  `routes/pull-requests/pr-review.ts`, `routes/pull-requests/pr-commits.ts`. The two ticket routes each have their
  own `ignoreRule` and the two pull request routes inline the same thing: factor one helper,
  `fileFlags(config): (file) => { ignored, code }`, in a new small file of `routes/review/`, used by all four
  (it also removes a copy `dup` would count).
- No migration, no command, no worker change: the web reads the project's config it already loads.

## Client

- `lib/review/file-filter.ts` (pure, tested): `filterFiles(files, { query, codeOnly })`. Every word of the query
  is in `path` or in `oldPath` (a renamed file is found by its old name), case ignored. The list keeps the diff's
  order: this narrows, it does not rank.
- `components/review/use-file-filter.ts`: the query (kept while the page is open, not in the URL) and Code only
  (remembered in this browser, like List / Tree, `union.review.codeOnly`, wrapped in try/catch).
- `components/review/file-filter-bar.tsx`: the box (placeholder "Filter files", × to clear, Esc clears and
  leaves the box) and the Code only switch, under `ListHeader`. The count becomes "8 of 42 files" while either
  narrows the list.
- `file-list.tsx` (158 lines) takes the filtered files and passes them to `FileRows`, `SpecGroups` (a spec part
  with no file left is hidden) and `IgnoredFiles`. The state lives in `DiffBody` (and `commit-diff.tsx`) so that:
  - the file opened by default is the first visible one (`openFileId` gets the filtered list);
  - a file already open stays open on the right when the filter hides it; the list just has no row selected.
- `use-file-keys.ts`: `j` / `k` walk the visible files only.
- `/` focuses the filter box on the review page (the board's `/` is not mounted there; check `useShortcuts` does
  not fire both). Add it to the Review group of `shortcuts-help.tsx`.
- Nothing matches: "No file matches" with Clear, instead of an empty column.
- A link into the diff (`diff-link-code.tsx`, `?lines=`, the spec report's links) to a file the filter hides
  opens it anyway; the filter is left as it is.

Mind the limits: the bar and the hook are their own files so `file-list.tsx` and `diff-body.tsx` stay under 10
imports and 300 lines.

## Steps

1. Core `isCodeFile` and its tests; `code` on `DiffFileSummary` through the shared `fileFlags`; route tests that
   a test file and a lock file come back `code: false`, a source file `code: true`, with and without project
   patterns.
2. `filterFiles` and its tests (query on path and old path, Code only, both, empty query).
3. The bar, the hook, `FileList`, `DiffBody`, `commit-diff.tsx`, the keys.
4. Guide: `documentation/reviewing.md` (the file list paragraph: the filter, `/`, Code only and that it follows
   Settings → Size); the size settings paragraph in `documentation/settings.md` says the patterns also drive Code
   only. `docs/architecture/web.md` if it describes the diff summary.
5. Check in the real app with `scripts/ui-check/` on a ticket with tests, docs and a lock file in its change:
   filter, Code only, j / k, a hidden open file, a commit view, a pull request review; reload keeps Code only.

Saving `change-size.ts` reloads the worker on the live instance: build in a worktree, then `bun run active`
before bringing it in.

## Open question

- Code only hides tests. If reviewers want the tests beside the code, the switch could become three choices
  (All / Code and tests / Code) using the `TEST_PATTERNS` split `measureChange` already makes. Proposed: start with
  the single switch, as asked.
