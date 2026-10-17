# Ticket flows: choose the steps a ticket runs

Status: steps 1 and 2 built (branch `ticket-flows`, 2026-10-17). The three decisions below were confirmed.

## Why

Every ticket runs the whole pipeline: `intake` → `summary` → `technical` → `test_plan` → `implement` →
`final_review`, with an approval after each step. For a typo or a one-line fix that is four planning runs (one on
Opus) and four clicks before any code is written. The user should pick, per ticket, which steps run.

## Design in short

A **flow** is the ordered list of pipeline steps a ticket runs: a subset of `STEPS`, in pipeline order. Projects
offer named **presets**; a ticket picks one, or a custom set of steps, before it starts.

Built-in presets (the project can edit them and add its own):

| Preset   | Steps                                                          | For                             |
| -------- | -------------------------------------------------------------- | ------------------------------- |
| Full     | intake, summary, technical, test_plan, implement, final_review | features, unclear tasks (today) |
| Standard | technical, implement, final_review                             | a clear task that needs a plan  |
| Quick    | implement, final_review                                        | typo, small fix, config change  |

Custom: the same picker with each planning step as a checkbox; `implement` and `final_review` are always on in
v1.

Why keep `final_review` mandatory: its approval is what marks the PR ready and moves the ticket to Done, and the
rebase and "Request changes" paths all lead back into it (`states.ts`). Making it optional means a second ending
(Done straight after `implement`) and a different rebase chain. It is cheap on a small diff; it can be revisited
once flows are in use (see Later).

Why not just "auto-approve": skipping removes the runs (and their usage); auto-approve would still pay for them.
Auto-approve is a separate, later option (see Later).

## Rules

- A flow always ends with `implement`, `final_review`; planning steps keep their order. Checked by one pure function
  (`flowProblems`), used by the web and the worker.
- A ticket without a chosen flow uses the project's default preset (Full unless changed), **resolved and stored on
  start**, so editing a preset later never changes a ticket already running.
- The flow can be changed while the ticket is in Backlog. Once started, it is fixed in v1; a "Skip to
  implementation" action from a planning step is a later item.
- Skipped steps leave no output: no tab, no issue comment, nothing in `approvedBefore`.

## State machine (`packages/core/src/states.ts`)

Keep it pure: the flow is an argument, not read from anywhere.

- `transition(phase, action, flow)`, `flow: readonly Step[]` (callers that cannot reach `start`/`approve` pass the
  ticket's flow anyway, through `dispatch`).
- `start` → `running` on `flow[0]` instead of `intake`.
- `approve` → `running` on the next step **in the flow** (`nextStep(step, flow)`), else `done`.
- Revise, rebase, simplify, retry, commit refusal: unchanged (they only touch `implement`/`final_review`, which every
  flow has).
- `STEPS` stays the full pipeline; `FULL_FLOW = STEPS`.
- Tests in `states.test.ts`: Quick starts on `implement`; Standard approves `technical` into `implement`; Full is
  unchanged (existing tests pass `FULL_FLOW`).

## Core

- New `packages/core/src/flows.ts` (pure, browser-safe): `FlowPreset = { id, name, steps }`, `BUILT_IN_PRESETS`,
  `flowProblems(steps)`, `resolveFlow(ticket, project)`, `nextInFlow`.
- `tickets.flow`: JSON `Step[]`, nullable (null: not chosen, the project's default applies at start). Migration
  with `bunx drizzle-kit generate`.
- `ProjectConfig.flows?: FlowPreset[]` and `ProjectConfig.defaultFlow?: string` (a preset id); absent: the built-in
  ones and Full.
- `dispatch` (`tickets.ts`): on `start`, write the resolved flow onto the ticket in the same transaction, then pass
  it to `transition`.

## Prompts (`apps/worker/src/prompts.ts`)

The default prompts name the earlier steps ("as described by the approved summary, technical implementation and test
plan", "Write the tests listed in the test plan"). Rather than forking each prompt, `buildPrompt` adds a short
**Flow** section when steps were skipped, so user-edited prompts keep working:

- No planning at all: "This is a short task: no plan was written. Work from the ticket itself. Add or update tests
  where the project would expect them for this change."
- No test plan: "No test plan was written: add the tests this change needs, at the level the project already tests
  it."
- `final_review` gets the same note, so it does not flag a "missing test plan" or "missing summary".

The wording lives in core (`flowNote(flow, step)`), unit-tested.

## Web

- API: `POST /tickets` and `PATCH /tickets/:id` accept `flow` (array of steps or null), checked with
  `flowProblems`; refused once the ticket left Backlog. Project settings save `flows` and `defaultFlow`.
- `client/components/flow-picker.tsx` (new): preset buttons (Full / Standard / Quick / project presets) and a
  "Custom" toggle with one checkbox per planning step. Used in:
  - the ticket form (`ticket-form.tsx`), and the GitHub issue and Notion imports;
  - the Overview tab, while in Backlog (a row like the base branch row: `base-branch-row.tsx`);
  - the board card: a small badge when the flow is not Full (e.g. "Quick").
- `ticket-tabs.tsx`: show only the flow's steps (today it maps `STEPS`).
- Project settings page: a **Flows** section to edit presets and pick the default (its own component, the settings
  page is near the file limit).

## Worker

Little changes: the scheduler runs whatever step the phase names. Check that nothing assumes `intake` runs first
(the container and clone come from `ensureTicketContainer`, which every step calls; the implementer starts a fresh
session when there is no planning session to resume). `github/sync.ts` already posts only steps with outputs.

## Steps

1. Core: `flows.ts`, `transition(…, flow)`, `dispatch`, schema + migration, `flowNote`; tests. Built.
2. Worker: pass the flow note into `buildPrompt` for `implement` and `final_review`. Built. A real Quick ticket
   run (agent included) waits for step 3, since no flow can be chosen before.
3. Web: API fields, flow picker in the form and Overview, tabs filtered, card badge.
4. Project settings: Flows section (presets, default).
5. `SPEC.md` (Flow, Decisions) and `docs/architecture/*` updated.

## Later

- **Auto-approve** per step in a preset (the phase's `thenRun` already chains a step without stopping), e.g. Quick
  runs `implement` then `final_review` without a click.
- **Skip to implementation** from any planning step's approval.
- **Model per preset**: Quick implements on Sonnet.
- **Pick from labels**: a GitHub or Notion label (`typo`, `size:S`) selects a preset on import.
- **Suggested flow**: intake (or a cheap Haiku call on creation) proposes Quick / Standard / Full from the ticket
  text; the user confirms.
- Optional `final_review` (a flow ending at `implement`: approving it marks the PR ready).
