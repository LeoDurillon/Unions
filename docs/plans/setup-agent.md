# Plan: a setup agent at the end of the wizard

Status: planned (2026-11-10), decisions made (see the end).

## Problem

A new project starts with no install or check command, no preview, no e2e command, no saved scripts and no
project instructions. Each of them is a settings page to understand and fill in by hand: the Environments
settings alone have six tabs (Compose, Variables, Agent, Shared, End-to-end tests, Limits). Until the checks are
set the agents' work is not gated, and until the preview is set no ticket can be tried in a browser. Most of the
answers are in the repository already: `package.json` scripts, a `compose.yaml`, a Playwright config, CI workflows,
`.env.example`, a README.

## Idea

The wizard's last step asks whether an agent should set up the project. If the user says yes, an agent reads the
repository after the project is created and proposes settings. The worker checks the proposal without
using Claude. The user then reviews it section by section and applies what they want. Nothing is applied without the
user's click. Changes the repository itself needs (a compose file, an e2e setup, a missing `test` script) become
proposed tickets, not edits.

It is built on investigations (queue, run slots, container, cancel, Log, follow-up, usage accounting) the same way
"Suggest improvements" is (`usage-suggestion.ts`). The setup agent differs in two ways: its answer is a
structured proposal, and the browser applies it through the existing settings endpoints, so every check those pages
run also covers the agent's values.

## What the agent proposes

One final `json` block, its format appended by the worker after the editable prompt (`docs/architecture/agents.md`,
"A new agent whose answer is parsed"). Every section is optional and each carries a one-line `why` naming the files
it read:

| Section        | Becomes                                                                                                                                                             | Settings page                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `checks`       | `installCommand`, `gateCommand`                                                                                                                                     | Project → Checks                      |
| `scripts`      | `config.scripts` (name, command, timeout)                                                                                                                           | Project → Scripts                     |
| `preview`      | `composeFile`, `services` (name, port, prefix), plain `env` with templates, `agentServices`, `sharedServices`, `profiles`, `forwardPorts`, `startForImplementation` | Environments → Compose, Agent, Shared |
| `e2e`          | `preview.e2eCommand`                                                                                                                                                | Environments → End-to-end tests       |
| `secrets`      | the **names** of secret variables the preview needs, with where to get each; never a value                                                                          | Environments → Variables              |
| `projectFiles` | paths the user must supply (a `.env.local`, a dump), with what goes in them; never contents                                                                         | Project → Files                       |
| `instructions` | a draft of `config.instructions`: commands, layout and conventions the agents would otherwise rediscover each run                                                   | Project → Instructions                |
| `agentImage`   | a Dockerfile on the base image, only when the repository needs a toolchain the default image lacks (Python, Go, a system library)                                   | Environments → Agent image            |
| `tickets`      | repository changes the setup needs: title and description                                                                                                           | Backlog                               |
| `questions`    | what it could not decide (two compose files, no way to tell the web port)                                                                                           | shown at the top                      |

The "add scripts" of the request means Union's saved scripts (`config.scripts`). Scripts the repository itself
lacks (`package.json` `test`, `e2e`) are proposed as tickets.

## The prompt

`setup-agent-prompt.ts` in core, pure, tested. It holds:

- What Union does with each setting, in a few lines each, taken from the spec (`preview-environments.md`,
  `custom-agents.md`) so the agent knows what each value is for. Example: the gate runs after every implementation
  step and must be fast and deterministic.
- What a preview may not do, from `composeProblems` (privileged, host network, the Docker socket, mounts leaving the
  repository, external volumes, `union-…` names), and the templates it may use (`PREVIEW_TEMPLATES`).
- What the default agent image already has (`docker/agent.Dockerfile`: the JavaScript toolchains, Playwright's
  libraries), so it proposes an image only when needed.
- That it reads, and does not guess: when two answers fit, it asks in `questions`.

## Step 1: ask in the wizard, run, read the proposal

- **Wizard** (`review-step.tsx`, `draft.ts`): a checkbox under the summary, unchecked by default: "Let an agent
  set up this project. It reads the repository and proposes the checks, preview, e2e command, scripts and
  instructions; you apply what you want. Uses your Claude subscription." `Draft.setupAgent: boolean`.
  Once ticked, a model picker (the agents' list) shows under it, Sonnet by default: `Draft.setupModel`.
  The checkbox is always enabled: the web does not check the Claude login.
- **Create**: after `api.createProject`, `createFrom` calls `POST /api/projects/:projectId/setup` when the box is
  ticked. A failure there does not fail the wizard: the project exists, and the board says the setup could not
  start and offers **Run setup** again.
- **Core** `setup-agent.ts`: `queueSetup(db, projectId, model)` creates a repository investigation with
  `kind: 'setup'` (migration: `investigations.kind`, `'question'` by default), the setup prompt, the chosen model
  (`SETUP_DEFAULT_MODEL`, Sonnet, when none is sent; an unknown one refused) and the tools `Read`, `Grep`,
  `Glob`. A repository investigation clones the base branch, which is what setup should read. Refused while a
  setup run of the project is queued or running.
- **No Claude login**: the worker finds no credential to seed (`provision.ts`) and fails the run with "Claude is
  not logged in: log in (see Installation), then click Run setup." The board's item shows that message and
  **Run setup**, and the error is the investigation's, as for any failed run.
- **Parse**: `setup-proposal.ts` in core (pure, browser-safe): reads the answer's final `json` block into a typed
  `SetupProposal` with type guards. Values that cannot be valid are dropped and reported: bad service or variable
  names, ports out of range, a secret given with a value, a project file given with contents. A missing or
  broken block gives `null` and the plain answer, as a review finding does today.
- **Board**: while it runs, the Getting started card's first item reads "The setup agent is reading the
  repository" with its Log. Once answered, the item becomes **Review the setup** (done when every section is
  applied or dismissed). The investigation is also listed on the Investigations tab like any other.
- Tests: the parser (each section, dropped values, missing block), the prompt (sections and constraints present),
  `queueSetup` (refused twice, kind stored).

## Step 2: review and apply

A **Setup** page (`?setup=<investigationId>`, from the card and from the investigation's page) with one card per
section:

- Each card shows the proposed values next to the current ones, from a pure `setupDiff(proposal, config)` in core.
  A card whose values already match says so and counts as applied, so the page needs no state of its own.
- **Edit** opens the values in the same fields the settings page uses. **Apply** sends them to the endpoint that
  page uses (`project-settings`, `preview-settings`, `agent-image`, scripts), merged over the current settings,
  so the endpoint's checks run and its errors appear on the card. **Dismiss** hides a card (remembered per
  investigation in `localStorage`, like the checklist's Hide).
- `secrets` and `projectFiles` are to-dos: a field for the secret's value, or an upload, on the card itself,
  through the existing endpoints.
- `tickets`: **Create ticket** per item, into the Backlog (an issue follows as for any ticket).
- `questions`: a text box and **Ask** sends the answers as an investigation follow-up. The new answer replaces
  the proposal and the cards recompute.
- Split from the start: one component per card kind, a hook for the mutations (`use-setup-apply.ts`), the page
  itself only lays them out (the 60-line, 300-line and 10-import limits).
- Tests: `setupDiff`, and a UI check (`scripts/ui-check/`, writes blocked) of the page on a stubbed proposal.

## Step 3: check the proposal without Claude

Before the cards show, the worker tries what it can, at no Claude usage, and puts the result on each card:

- **Checks**: the install command, then the gate, in a throwaway container of the project's agent image on the
  clone, with the gate's timeout. The card shows passed or failed, with the end of the output.
- **Preview**: the proposed compose file and additions resolved through the compose helper
  (`docker compose config`) and checked with `composeProblems`. The services and ports are checked against what
  the resolved file declares. No preview is started: it needs a ticket's workspace.
- **Agent image**: `agent-image-source` checks only (building waits for Apply, as on the settings page).
- A failed check offers **Ask the agent to fix**. It sends a follow-up with the output, as the e2e "Send to agent"
  does, reusing the command-output path (`docs/plans/README.md`, loose ends).
- Stored on the investigation (`setup_checks` JSON column), written by the worker only. The web reads it.
- Real Docker test with ticket id 9001's conventions (`docs/architecture/testing.md`): a fixture repository with a
  compose file and a failing gate; clean up `union-*` containers and volumes.

## Step 4: run it again later

**Run setup** in Settings → Project (with the same model picker, Sonnet by default), for a project made before
this, a repository that changed, or a run that failed (no Claude login). Same run, and
the diff makes the cards show only what differs from the current settings.

## Docs

- User guide: `documentation/first-project.md` (the wizard's checkbox, then **Review the setup**), `settings.md`
  (Run setup), `investigations.md` (setup runs listed there).
- Spec: `docs/spec/setup-agent.md` once step 2 is built; `agents.md` gets the setup format in the table of formats
  the worker appends.

## Decisions (2026-11-10)

1. **Checkbox off by default**: it uses Claude usage, and AGENTS.md asks for consent before that.
2. **Read-only agent** (Read, Grep, Glob); the worker checks the result (step 3) instead of the agent running
   commands. Cheaper and safer than a full agent session with `Bash`.
3. **Model chosen by the user, Sonnet by default**: reading configs, not writing code. The wizard and Run setup
   both offer the choice.
4. **No login check in the web**: the checkbox is always enabled. Without a Claude login, the run fails with a
   clear message that says to log in (Installation) and then use **Run setup**.
5. **Never apply automatically**, not even the sections whose checks passed: settings change what every agent run
   does.
