# Plan: a spec report on a review

Status: step 1 built (2026-10-27, branch `review-report`); decisions to confirm (end of file).

## Why

The review page's agents each answer one question. **Review with agent** leaves line comments on bugs, **Group by
spec** says which files implement which part of the spec, **Explain** explains selected lines. None of them says, in
one place, whether the change does what the specs ask: what is done, what is partly done or done differently, what
is missing, what was changed without being asked for, and what that means for the reviewer. The final review step
comes close, but it runs only in a ticket's pipeline, against the approved planning outputs, and not on a pull request
under review or against the review's Specs bar.

A **report** answers it: an agent reads the review's specs and the whole change, compares them part by part, and
writes a full report the reviewer reads before the diff.

## The flow

1. **Report** (review page header, beside Group by spec; a ticket's branch or a pull request under review) opens a
   dialog: the specs it will read (the review's **Specs** bar, with **Edit the specs**, as Review with agent does),
   then **Start**. It queues one run.
2. While it runs, the header shows "Writing the report…" with the agent's last steps and **Cancel**, as the other
   review agents do. Runs share the run slots.
3. The report shows in a **Report** tab, added before Diff (`sections` of `review-page.tsx`), on both review pages.
4. When the change has moved since (a new snapshot for a ticket, a new head for a pull request), the tab says
   **Outdated** and offers **Run again**; the old report still shows.

## What the report says

From the top:

- **Verdict**: `matches`, `partial` or `diverges`, with a short summary of the change and how it meets the specs.
- **Counts**: "6 done · 2 partial · 1 missing · 1 differs · 3 not in the spec", each a link to its section.
- **Important files**: the files to read first, in the order to read them (at most 8), each with why it matters
  (the core of a requirement, a risky change, an entry point, a migration, a public API, a test that proves a
  requirement), its key lines as `path:start-end`, and the requirements it serves. An unchanged file the change
  depends on (a caller whose behaviour moves) may be listed, marked "not changed". The rest of the change is
  supporting: the reviewer can skim it.
- **Requirements**, in the specs' order and words, each with:
  - its **status**: `done`, `partial`, `missing`, `differs` (done another way than the spec says), `unclear` (the
    spec is ambiguous here);
  - the spec's part, quoted, and which spec it comes from;
  - **evidence**: the code that implements it, as `path:start-end` (links that open the file at those lines in the
    Diff tab);
  - **tests** that cover it, or "no test";
  - a **note**: what is missing or different, and what the reviewer should check.
- **Not in the spec**: changed files or hunks no requirement asked for, each with a reason and a risk (low, medium,
  high): a refactor, a dependency bump, a behaviour change nobody asked for.
- **Risks**: what could break beyond the spec (migrations, public APIs, security, performance), with the files.
- **Questions**: ambiguities in the specs and assumptions the change makes, to ask the author or the spec's owner.
- **Docs**: the repository's own docs (`docs/`, READMEs, AGENTS.md, ADRs) the change should have updated and did
  not.

It does not judge style and does not repeat Review with agent's line comments: it is about the spec.

## What the agent returns

The worker appends the format after the editable prompt (as `review_groups` and `review_explain` do), so an edit of
the prompt cannot break it: a final `json` block.

```json
{
  "verdict": "partial",
  "summary": "…",
  "importantFiles": [
    {
      "path": "api/src/campaign/activate.ts",
      "why": "Unpublishes the other scenarios inside the activation transaction: the heart of the change.",
      "kind": "core",
      "lines": [{ "start": 40, "end": 72 }],
      "requirements": ["auto-unpublish"]
    }
  ],
  "requirements": [
    {
      "key": "auto-unpublish",
      "title": "Automatic unpublishing",
      "spec": "À l'activation de la campagne : dépublier automatiquement…",
      "specId": 3,
      "status": "done",
      "evidence": [{ "path": "api/src/campaign/activate.ts", "start": 40, "end": 72 }],
      "tests": ["api/src/campaign/activate.test.ts"],
      "note": ""
    }
  ],
  "outOfScope": [
    { "path": "package.json", "hunks": [], "reason": "Dependency bump", "risk": "low" }
  ],
  "risks": [{ "title": "…", "detail": "…", "paths": ["…"], "severity": "medium" }],
  "questions": ["…"],
  "docs": [{ "path": "docs/spec/flow.md", "note": "…" }]
}
```

The host checks it before keeping it, as Explain and the grouping do (`review-report-result.ts`):

- a spec quote is kept only when it is found in a spec that was sent (`specId` one of them); otherwise the
  requirement is kept without the quote, marked "quote not found";
- evidence and tests are kept only when their path is in the checkout, and line ranges are clamped to the file;
- an important file is kept when it is in the diff, or in the checkout (then marked "not changed", at most 2 of
  those); `kind` is one of `core`, `risky`, `entry`, `migration`, `api`, `test`, else `core`; its `requirements`
  must be keys of the report's requirements; the list is cut to 8, in the agent's order;
- out-of-scope paths and hunks must be in the diff (`hunkKey`, as the grouping);
- every changed file is either some requirement's evidence or out of scope: the host adds the ones left out to
  "Not in the spec", reason "not placed by the agent";
- the report counts what it dropped, and shows it at its foot.

A run whose block cannot be read is asked once more for it (as the split plan is), then fails with the agent's text
kept, so the user can still read it.

## Building it

### Core (`packages/core`)

- Agent `review_report`: `AGENT_IDS`, `DEFAULT_PROMPTS`, `MODEL_BY_AGENT` (Opus: it compares and judges, unlike
  the grouping), `DEFAULT_TOOLS` (`REVIEW_TOOLS`: read-only and git reads), `BuiltInRunAgent`.
- `schema-review-reports.ts`: `review_reports`, one row per run, the newest shown: `ticket_id` / `review_id` (the
  `review_comments` owners, cascade), `status` (queued, running, succeeded, failed, cancelled), `specs` (JSON: each
  spec's id, label and text as sent), `head_sha`, `result` (JSON, the `ReviewReport` type), `raw` (the agent's text,
  when the block could not be read), `error`, timestamps. Migration with `drizzle-kit generate`.
- `review-report-types.ts` (pure, browser-safe): the report's types and statuses; `schema-review-runs.ts`: the
  owner and status columns the grouping, explanation and report tables share.
- `review-reports.ts`: queue, claim, finish, cancel, newest per owner, one at a time per change (as
  `review-groupings.ts`).
- `review-report-markdown.ts` (pure, browser-safe): the report as markdown, for **Copy as markdown**. Tested.
- Event payload: `review_report_changed` on every status change, as `review_grouping_changed` (`event-payloads.ts`).

### Worker (`apps/worker`)

- `review-report-format.ts`: what the agent reads (the specs as titled sections with their ids, the changed files
  with their stats and hunk keys, reusing `review-grouping-format.ts`) and the block it answers in.
- `review-report-prompt.ts`: `sharedPrompt` (no lessons, as the other review runs), the specs, the change, the
  agent's prompt, the format.
- `review-report-result.ts`: the checks above. Tested on fixtures, including a bad block, a made-up quote, a path
  outside the diff, a file left out, an important file that does not exist, too many important files.
- `review-report.ts`: the runner, beside `review-grouping.ts`: the same run slots; a ticket's run in its own
  container on its branch (refused while the ticket runs), a pull request's in a throwaway `union-s<id>` container
  cloned at the reviewed commit (`agent-review-target.ts`). `modelFor`, `effortFor`, `toolsFor`, `BASE_DENIED`
  plus no writing tools; events to `appendAgentLine` so usage counts. Cancel through a `cancel_review_report`
  command hook. Tested with a fake agent.

### Web (`apps/web`)

- `routes/review-reports.ts` under `reviewBase` (ticket and pull request share it): `GET /reports/latest`,
  `POST /reports` (reads the review's specs from `review_specs`, refuses when none can be read, inserts the queued
  row), `POST /reports/:id/cancel` (queues the command). Route tests with the fakes.

### Client (`apps/web/client`)

Split from the start for the lint limits:

- `review-report-api.ts`, `use-review-report.ts` (newest report, start, cancel, live through SSE events).
- `report-button.tsx` and `report-dialog.tsx` (reuses the specs list of `agent-review-dialog.tsx`; factor it out
  rather than copy it, for `dup`).
- `report-tab.tsx` (verdict, counts, outdated), `report-important-files.tsx` (the ordered list, each file a link
  that opens it at its key lines in the Diff tab), `report-requirement.tsx` (one card), `report-sections.tsx` (not
  in the spec, risks, questions, docs).
- The file panel marks the important files of a current report (a "Key" badge with the reason on hover), in List,
  Tree and By spec, so the order shows while reading the diff.
- Actions on the report: **Copy as markdown**; on a requirement or a risk with evidence, **Add as draft comment**
  (opens the comment editor on those lines with the note, nothing sent); on a ticket, **Send missing to the
  implementer** adds the `missing` and `partial` notes to the review, as Add to review does.
- `AGENT_LABELS`: title and description.

### Docs

- `docs/spec/pull-requests.md`: a **Report** section beside Specs and Explain.
- `docs/architecture/agents.md`: the agent in "Where each agent runs" and in the appended formats table;
  `apps/web/src/agents-docs.test.ts` fails until it is there and in `documentation/agents.md`.
- `docs/architecture/database.md` (the table), `docs/map/` (`bun run map`).
- The user guide: the review page's page in `documentation/` (the Report button and tab), `documentation/agents.md`.

## Cost

One agent run per click, on Opus by default, about an agent review's size plus a longer answer. Nothing runs on its
own.

## Steps

1. Core: the agent and its defaults, the table and migration, the records, the markdown, the event payloads; tests.
2. Worker: format, prompt, result checks, runner, cancel; tests with a fake agent.
3. Web routes and their tests.
4. Client: button, dialog, Report tab, important files and evidence links, the Key badges in the file panel,
   outdated and Run again, Copy as markdown. Checked in the
   browser with writes blocked (`scripts/ui-check/`); no agent run.
5. Actions: Add as draft comment, Send missing to the implementer.
6. Docs and the guide; then one real run on a test ticket and a test pull request, after the user agrees (it uses
   their Claude usage).

Later: a stack's report (every member's specs, per D6 of [review-specs](review-specs.md)); posting the report as a
pull request comment (a worker write, through a command); a notification when it ends; feeding **By spec** from a
current report instead of a separate grouping run.

## Decisions to confirm

- **D1. On request only**, from the review page; not a pipeline step. (A custom agent placed after implementation
  can already write a report of sorts, but without the Specs bar.)
- **D2. Specs**: the review's Specs bar, as the other three actions.
- **D3. Model**: Opus by default, editable in Union settings.
- **D4. Where it shows**: a Report tab before Diff, on both review pages; only the newest report is shown.
- **D5. Stacks and split tickets**: v1 reports on one pull request, or on a ticket's whole branch (a split ticket's
  selected slice is a later step).
- **D6. Nothing is written to GitHub or Notion** in v1; posting the report on the pull request comes later.
- **D7. Important files**: at most 8, in reading order, changed files first; up to 2 unchanged files the change
  depends on; marked in the file panel while the report is current.
