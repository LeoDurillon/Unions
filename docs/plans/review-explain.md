# Explain a selection of the diff

Status: built (2026-10-19, branch `review-explain`), steps 1 to 4, checked with tests on a fake agent; no real run
yet (it uses the user's Claude usage). Differences from the plan below: the agent's default effort is the CLI's
(none of the agents has a default effort); the panel names its specs but has no **Change** link (they are changed in
**Review with agent**); a ticket's explanation lines are also the ticket's own, so its usage counts them (they show
in its Log, as an agent review's do).

## Why

On the review page (a ticket's branch, or a pull request under review), the reviewer often stops on a block and
asks: what does this do, why is it here, which part of the spec asked for it? Today they open the file elsewhere,
read the callers, then search the spec by hand. An agent can answer that in place: it has the checkout, the spec
texts and the repository's own docs.

## Design in short

- **Ask**: select lines as for a comment (click, Shift-click to extend). Beside **Add comment**, the editor under
  the selection gets **Explain** (and an optional question field: "Why is the retry needed here?"). Explain opens
  the side panel and queues the run.
- **Explain panel**: an optional panel on the right of the diff, opened with an **Explain** toggle in the review
  header and remembered in the browser like the List/Tree choice. Closed, the page is as today; Explain on a
  selection opens it.
- **What it shows**, for the newest explanation, at the top:
  1. The selection: `path`, `lines 40-58 (new)`, a link that opens the file on those lines.
  2. **Spec parts** at once, before the agent ends, when the review has a grouping by spec: the parts whose hunks
     the selection touches (from the grouping, no agent), as chips with their quoted spec on hover.
  3. While running: "Explaining…" with the agent's progress (files it reads) and Cancel.
  4. The answer: **How it works** (what the code does, with the callers and callees it relies on, cited as
     `path:line` links that open in the diff when the file is in the change), **Specs** (the parts of the specs
     it implements, each quoted with its source: "PR description", "Notion: Export to CSV"), **Docs** (the
     repository's own docs it relates to: `docs/spec/export.md § Limits`), and **Not in the spec** when nothing
     asked for it.
  5. **Ask a follow-up** (resumes the same session), **Copy as comment** (opens the comment editor on the same
     lines with the answer quoted, for the user to edit; nothing is sent to the implementer by itself).
- **History**: earlier explanations of the review, newest first, folded; one opens its file and lines.
  **Outdated** when the change moved since (a new snapshot, a new head), with **Explain again**.

Nothing is written to GitHub or Notion. Each Explain is one agent run on the user's Claude usage.

```
┌ Files ──────┬ src/export/csv.ts ─────────────────────┬ Explain ─────────────────── ✕ ┐
│ …           │  40 + const rows = await paginate(…)   │ src/export/csv.ts 40-58 (new)  │
│             │  41 + for (const row of rows) {        │ Spec parts: [Export to CSV]    │
│             │  …  (selected)                         │ ── How it works ──             │
│             │  58 + }                                │ Streams the rows in pages of…  │
│             │  [Explain] [Add comment] [Cancel]      │ ── Specs ──                    │
│             │                                        │ “Exports over 10k rows…” (PR)  │
│             │                                        │ ── Docs ──                     │
│             │                                        │ docs/spec/export.md § Limits   │
│             │                                        │ [Ask a follow-up] [Copy as c.] │
└─────────────┴────────────────────────────────────────┴────────────────────────────────┘
```

## Decisions

- **D1. Which specs.** The explanation is checked against the same specs as **Review with agent**: the last
  agent review's specs when there is one, else the defaults (`use-default-specs`: the PR descriptions, the
  ticket's text, the linked Notion page once [Link a review to its Notion page](review-notion-link.md) is built).
  The client sends them with the request, like the agent review (`parseAgentReviewSpecs`, same limits). The panel
  says which ("Specs: PR description · Notion: Export"); **Change** opens the spec cards. No picker per click.
- **D2. Repository docs too.** "Specs it is linked to" also means the repository's own docs (`docs/`, `README`s,
  ADRs, `AGENTS.md`/`CLAUDE.md`). The agent searches them with its read tools; the host keeps only cited paths that
  exist in the checkout. No index built ahead.
- **D3. Spec parts from the grouping, without the agent.** When the review has a succeeded grouping by spec, the
  host maps the selection's hunks to its parts (`hunkAt`, the group's `hunks`) and shows them at once; they are
  also given to the agent as a starting point. An outdated grouping is still used for the files it knew, marked
  outdated.
- **D4. Where it runs.** A ticket: its own container, as the agent review and the grouping (`openTarget`).
  Refused while the ticket runs, with the grouping's own check and message (`GroupingTarget.refusal`, confirmed
  2026-10-19): its working tree is not the snapshot on screen. A pull request: a throwaway container per run, `union-e<explanationId>` (confirmed
  2026-10-19), cloned at the reviewed commit like `union-a<id>` with the Claude credential and removed when the
  run ends, and by `recover`. Not `union-r<id>`: the review's preview container runs the PR's code and never gets
  the credential.
- **D5. Run slots.** Shared with the pipeline, investigations and agent reviews (Max usage). A queued one says
  "Waiting for a run slot". One explanation runs per review at a time; the others wait in order.
- **D6. Agent.** A new `review_explain` agent in Agent settings: default Haiku (confirmed 2026-10-19: short
  answers, lower cost), effort low, read-only tools plus
  git reads (as the agent review). Its prompt and model are editable like the others.
- **D7. Follow-ups.** A follow-up is a new row with `parentId`, resuming the parent's session (`resumeSessionId`,
  falling back to a fresh run with the thread in the prompt as `agent.ts` does when the session is lost). A pull
  request's follow-up runs fresh with the thread: its container is gone with the session. The panel
  shows the thread under the first answer.
- **D8. Hunk and file too (later).** A hunk header gets an **Explain** icon (the whole hunk), and the file header
  **Explain file**. Same row, `start..end` set to the hunk or the whole file. Step 4.

## What the agent returns

A JSON block at the end of its answer, parsed and checked by the host like the grouping
(`review-grouping-result.ts`):

```json
{
  "explanation": "Markdown: what the selected code does and how, with `path:line` citations.",
  "specs": [
    {
      "source": "PR description",
      "quote": "Exports over 10k rows are paged",
      "how": "The loop pages by 500."
    }
  ],
  "docs": [{ "path": "docs/spec/export.md", "heading": "Limits", "why": "Defines the page size." }],
  "notInSpec": "Optional: why nothing in the specs asks for it."
}
```

The host keeps a spec only when its `source` is one of the specs sent and its `quote` is found in that text
(whitespace-insensitive); a doc only when its path exists in the checkout. What it drops it counts and the panel
says so ("2 citations dropped: not found"). No block: the run fails with the answer's end, as the grouping does.

## Core (`packages/core`)

- `schema-review-explanations.ts` (new): `review_explanations`: `id`, `ticket_id` | `review_id` (the
  `review_comments` owners, cascade), `parent_id`, `path`, `side`, `start_line`, `end_line`, `excerpt` (the
  selected text, `diffExcerpt`), `question`, `specs` (JSON, as sent), `head_sha`, `status` (queued, running,
  succeeded, failed, cancelled), `result` (JSON), `session_id`, `error`, timestamps. Migration with
  `cd packages/core && bunx drizzle-kit generate`.
- `review-explanations.ts` (new): `queueExplanation` (refuses a selection outside the diff; the route refuses a running ticket,
  D4), `claimExplanation` (oldest queued whose owner has none running, D5), `finishExplanation`,
  `cancelQueuedExplanation`, `failInterruptedExplanations`, `explanationsOf(owner)`. Tests next to it.
- `explanation-spec-parts.ts` (new, pure, browser-safe): the grouping's parts for `path` and a line range (D3).
  Tests next to it.
- `agents.ts`: `review_explain` with its default prompt, model and tools (D6).
- `event-payloads.ts`: `review_explanation_changed` `{ explanationId, ticketId | reviewId, status }`, like
  `review_grouping_changed`, for the live invalidation.

## Worker (`apps/worker`)

- `review-explain.ts` (new): `ReviewExplainRunner`, the shape of `ReviewGroupingRunner` (claim on free slots,
  cancel, `recover`, `idle`). The prompt (`review-explain-prompt.ts`, new): shared prompt, the agent's prompt, the
  specs (`specsSection`), the spec parts (D3), where the change is (`target.about`, `git diff base...HEAD`), the
  selection (path, side, lines, excerpt), the question, then the answer format. Agent events go to the run's log
  (`agent_log.explanation_id`, nullable, indexed) so the panel shows the progress.
- `review-explain-result.ts` (new): parses and checks the block (above); tests on fixed answers.
- `explanationContainer(id)`: `union-e<id>`, opened through `openTarget` and removed by `recover`, as the
  grouping's `union-g<id>`.
- The command hook `cancel_review_explanation`, like `cancel_agent_review`. Wired in the worker entry beside the
  grouping runner.
- Tests: the runner with a fake agent (succeeds, no block, cancelled, follow-up resumes the session, lost session
  falls back), a pull request's container removed after the run.

## Web (`apps/web`)

- `routes/review-explanations.ts` (new), mounted under the review target's base (`reviewBase`) beside the
  groupings, so ticket and PR reviews share it:
  - `GET /explanations`: the review's explanations, newest first, with their spec parts (D3) and `outdated`.
  - `POST /explanations`: `{ path, side, start, end, question?, specs, parentId? }`; checks the lines are in the
    file's patch, takes the excerpt, queues. 409 while the ticket runs (D4) or one is already queued for the same
    lines.
  - `POST /explanations/:id/cancel`: a queued one is cancelled here; a running one through the command.
  - `GET /explanations/:id/log`: the progress, like the investigation's Log.
- Tests: queueing (lines outside the diff refused, ticket running refused), the spec parts, cancel.

## Client (`apps/web/client`)

- `components/review/explain-panel.tsx` (new): the panel (toggle state, list, newest on top);
  `explanation-card.tsx` (new): one explanation and its thread (selection link, spec chips, sections, follow-up,
  copy as comment); `lib/use-explanations.ts` (new): the query, the mutations, the log poll while running.
- `comment-editor.tsx`: **Explain** beside **Add comment**, with the question field folded under it.
- `diff-body.tsx`: the panel on the right when open; opening an explanation picks its file and selects its lines,
  so the selection moves up from `OpenFile` into `DiffBody` (passed down; `OpenFile` keeps its threads).
- `review-header.tsx`: the **Explain** toggle with the running count. `view-toggle.tsx`: its remembered state
  beside the layout.
- `path:line` citations in the answer: a link that picks the file and line when it is in the change, else plain
  text (the file is not in the diff).

## Cost

One Haiku run per Explain, low effort: the excerpt, the specs and a few file reads. Follow-ups resume the session,
so the context is cached. A pull request's first Explain also clones the repository once.

## Steps

1. Record, runner, agent, result parsing and the routes, for a ticket's review only; the panel with the answer and
   the history; Explain in the comment editor. Tests on a fake agent. Check the panel on a real ticket's review
   (one real run uses the user's Claude usage: ask first).
2. Pull requests: the throwaway `union-e<id>` container (D4); check against real Docker with id 9001 and clean
   up `union-e9001*`.
3. Spec parts from the grouping (D3), the progress log, follow-ups (D7), Copy as comment, Outdated and Explain
   again.
4. Hunk and file (D8).

## Docs to update when built

- `docs/spec/pull-requests.md` (and the ticket review in `docs/spec/flow.md`): the panel, what an explanation
  holds, its cost.
- `docs/architecture/worker.md`: the runner and its `union-e<id>` container. `docs/architecture/web.md`: the route.
- This plan's status and `docs/plans/README.md`.
