# Plan: group a review's changes by spec

Status: steps 1 to 3 built (branch `review-spec-groups`); step 4 (hunks) later. Decisions taken (end of file).

## Idea

On the review page (a ticket's branch, or a pull request under review), the changed files can be grouped by what
they implement in the specification: "Automatic unpublishing", "Publish button disabled", "Tooltip", plus "Not in
the spec". An agent reads the specification and the change and does the grouping; it runs only when the user asks.
The grouping is a view of the file panel the user turns on or off, on top of the List/Tree choice.

It answers the reviewer's first questions: is every part of the spec implemented, where is each part, and what
changed that the spec did not ask for.

## The flow

1. **Group by spec** (review page header, beside "Review with agent") opens a modal.
2. **Choose the specification**, shown as text before anything runs:
   - **PR description** (default): the pull request's current description on GitHub, without Union's links
     (`withoutUnionLinks`). For a ticket without a PR yet, the default is the ticket's description.
   - **Ticket description**: the ticket's own text (cleaned when imported from Notion).
   - **GitHub issue**: a number or URL in the project's repository, read like the issue import.
   - **Notion page**: a page URL, read like the Notion import (cleaned with `notionMarkdown`).

   The text shows in the modal, editable, so the user can cut it to the part that matters. **Start** queues the run.

3. **The agent groups the change.** It reads the specification and the diff (the newest snapshot for a ticket, the
   reviewed commit for a PR) and returns its groups. Nothing changes on the page until it ends; the header shows
   "Grouping…" with Cancel, like the agent review.
4. **By spec** (a toggle in the file panel, beside List/Tree, remembered in the browser like the layout) shows the
   files under their groups. Each group lists or nests its files according to the List/Tree choice. Off, the panel
   is as today.

## What the agent returns

A JSON block at the end of its answer, parsed and checked by the host like the agent review's findings
(`agent-review-findings.ts`):

```json
{
  "groups": [
    {
      "key": "auto-unpublish",
      "title": "Automatic unpublishing",
      "spec": "À l'activation de la campagne : dépublier automatiquement…",
      "summary": "Unpublishes the other scenarios in the campaign activation handler.",
      "files": ["api/src/campaign/activate.ts", "api/src/scenario/publish.service.ts"]
    }
  ],
  "unrelated": [{ "path": "package.json", "reason": "Dependency bump" }],
  "missing": [{ "spec": "Tooltip on hover explaining why", "note": "No change found for it" }]
}
```

- **groups**: in the specification's order; `spec` quotes the part it covers, `summary` says what the files do
  for it. A file can be in several groups (a service serving two requirements).
- **unrelated**: changed files no group covers, with a reason: shown as "Not in the spec".
- **missing**: parts of the spec with no change: shown at the bottom of the panel, the most useful warning a
  reviewer can get.

The host keeps only paths that are in the diff, adds any changed file the agent left out to "Not in the spec", and
drops empty groups, so the panel always shows every changed file exactly as the plain list would, just grouped.
Ignored files (lock files, review ignore patterns) stay apart, as today.

## Panel when grouped

```
Files                      [List|Tree]  [By spec ●]
▾ Automatic unpublishing            3   ⓘ (spec excerpt + summary on hover)
    api/src/campaign/activate.ts
    api/src/scenario/publish.service.ts
▾ Publish buttons disabled          2
    …
▾ Not in the spec                   1
    package.json — Dependency bump
⚠ Not found in the change
    Tooltip on hover explaining why
Grouped from "PR description", 14:02 · outdated: the change moved since   [Group again]
```

- Group headers collapse; the open file stays highlighted wherever it appears.
- Draft counts per file as today; a group header sums them.
- **Outdated**: when the diff changed since the grouping (a new snapshot for a ticket, a new head commit for a PR),
  the panel says so and offers "Group again" (opens the modal with the same source); the old grouping still shows,
  files that are no longer in the diff are dropped, new ones go to "Not in the spec".

## Building it

- **Record**: a `review_groupings` table, one row per run, the newest one shown: the target (`ticket_id` or
  `current_review_id`, like `review_comments`), `status` (queued, running, succeeded, failed, cancelled), the source
  (`kind`, its reference, and the spec text as sent), what it was run on (the ticket's diff snapshot id, or the PR's
  head SHA), the `result` JSON, `error`, timestamps.
- **Runner**: a `ReviewGroupingRunner` beside `AgentReviewRunner` (same run slots, same place:
  `agent-review-target.ts` runs in the ticket's container on its branch, or in a throwaway `union-a<id>` container
  where the host cloned the PR at the reviewed commit). Read-only tools plus git reads, like the agent review.
  Cancellation through a command hook, like `cancel_agent_review`.
- **Agent**: a new `review_groups` agent in Agent settings (prompt and model editable; default Sonnet, it reads more
  than it reasons). The prompt gives the spec text, the list of changed files with their stats, and asks it to read
  the diff with `git diff` (as the agent review does) before grouping; the JSON format is appended by the host.
- **Web**: `POST /…/groupings` (source + text) queues a run; `GET` returns the newest one; the routes sit under the
  review target's base (`reviewBase`), so ticket and PR reviews share them. Reading the sources goes through what
  exists: the PR description (`OnboardingGitHub` discussion read), the issue (`issue-import`), the Notion page
  (`notion.pageMarkdown`, then `notionMarkdown`), all read only.
- **Client**: the modal (`group-by-spec-dialog.tsx`), the header button with its status, the toggle and the grouped
  rendering in `file-list.tsx` (groups wrap the existing `FileRows`, so List and Tree work inside each group), the
  "missing" list.

## Cost

One agent run per click, about the size of an agent review (the diff is read once). Nothing runs on its own.

## Steps

1. Record, runner, agent and parsing, with tests on a fake agent; the modal with the PR description and the ticket
   description as sources; the grouped panel.
2. GitHub issue and Notion page as sources.
3. Outdated detection and "Group again".
4. Later, if files are too coarse: group hunks instead of files (the diff view then marks each hunk with its group).

## Decisions

- **Granularity**: whole files. Hunks later (step 4), if files turn out too coarse.
- **Notion pages**: any page the project's integration can read (it only sees pages shared with it), not only rows
  of its data source: specs often live in a parent page. Read only, as the import.
- **Spec text**: editable in the modal before the run; the text as sent is kept on the run.
- **History**: only the newest grouping is shown; older runs are not kept for comparison.
