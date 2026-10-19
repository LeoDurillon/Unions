# Custom agents: the user's own pipeline steps

Status: steps 1 to 3 built (2026-10-19, branch `custom-agents`): core, custom steps in the worker, the prompt
writer; one real run (writer, then the step on ticket 9001, before the implementation). Steps 4 to 7
planned. Decisions D1 to D4 confirmed (2026-10-18).

## Why

The pipeline only has the built-in agents (`intake` … `final_review`). A team that wants a step of its own (a
security pass before implementation, an API design review, a migration-risk check, a UX copy review) has to wedge
it into another agent's prompt. The user should be able to describe a new agent in a sentence, get a prompt written
for it, give it tools, and place it in a flow like any other step.

## Design in short

- **Create**: Union settings → Models page gets a **New agent** button (and the menu gets a "Custom agents" group).
  A small dialog asks for a **name** and a **role**: free text, e.g. "Check the plan for security risks: auth,
  input validation, secrets, data exposure".
- **Save → the worker writes the prompt**: the web stores the agent with `promptStatus: 'queued'`; the worker
  claims it and runs a **prompt writer** agent (like the lesson writer: a throwaway container, no repository, the
  role and the house style of the built-in prompts in its prompt). Its answer becomes the agent's **default
  prompt**. The page shows "Writing the prompt…" and fills in when the worker is done (SSE event).
- **Edit**: the agent then has the same page as a built-in one (`agent-page.tsx`): prompt, model, effort, tools.
  "Reset" returns to the generated default prompt; **Regenerate** (after editing the role) queues the writer again
  and replaces the default (the user's edited prompt is kept until they reset, like built-ins).
- **Place it in a flow**: project settings → Agents → Flows lists the custom agents next to the planning steps; the
  user adds them to a preset and **orders** them (drag or up/down). The ticket's flow picker (Custom) offers them
  too.
- **Run**: a custom step runs like a planning step: markdown output, a tab on the ticket, approval or "Request
  changes", an issue comment, and its approved output goes into the prompts of the steps after it.

Custom agents are global (Union settings, like the built-in ones); flows are per project, so each project chooses
whether and where a custom agent runs.

## Decisions (confirmed)

- **D1. Where a custom step may go.** Anywhere before `final_review`, i.e. among the planning steps or
  between `implement` and `final_review`. After `implement`, it reads the branch (review-like) and its output goes
  to the final review. `final_review` stays last (it is what finishes the ticket, see `ticket-flows.md`).
- **D2. Write tools.** A custom step never pushes or commits. Its tools are free to choose, but
  `Edit`, `Write`, `NotebookEdit` and bare `Bash` are refused for a custom agent in v1 (its changes would sit
  uncommitted in the checkout for the implementer to trip over). A code-changing custom step is a later item.
- **D3. Defaults of a new agent.** Model Sonnet, effort default, tools `REVIEW_TOOLS` (`Read`, `Grep`,
  `Glob` and the git read rules): an agent's tools do not depend on where a preset places it, and reading git is
  harmless before `implement`. The prompt writer only writes the prompt; it does not pick tools.
- **D4. Deleting a custom agent.** Refused while a project preset names it or a ticket not yet done
  has it in its flow (same pattern as `removeTool`). Deleting is soft (`deletedAt`): the agent leaves the menu,
  the Models page and the flow pickers, while finished tickets keep its tab and runs under its name.

## Core (`packages/core`)

The biggest change: `Step` is a closed union used by `step_outputs`, `runs`, phases, titles and models. Custom
steps get a typed id instead of widening to `string`:

- `states.ts`: `CustomStep`, a template-literal type for `agent_<id>`; `PipelineStep` becomes
  `PlanningStep | CustomStep | 'implement' | 'final_review'`; `isCustomStep(value)`. `nextStep(step, flow)`
  follows the **flow's own order** (index in `flow`) instead of `STEPS`; it stays pure. `MODEL_BY_STEP` and
  `STEP_TITLES` stay for built-ins.
- Titles: `stepTitle(step, agents)` (new, in a small `step-titles.ts`): built-in title, else the custom agent's
  name (deleted ones included, D4). Replace the 15 `STEP_TITLES[step]` reads (worker render, notifications, lesson
  writer, client labels…) with it; the client gets the names from `/api/agents`.
- New table `custom_agents` (`schema-custom-agents.ts`): `id`, `name`, `role`, `defaultPrompt` (null until
  written), `promptStatus` (`queued` | `running` | `ready` | `failed`), `promptError`, `deletedAt`, timestamps. The user's
  overrides keep living in `agent_configs` under the key `agent_<id>`. Migration with `bunx drizzle-kit generate`.
- `custom-agents.ts` (new): create, rename/edit role, queue a regeneration, claim the next queued one (worker),
  finish/fail, delete with the D4 check, list.
- `agents.ts`: `AgentId` becomes `BuiltInAgentId | CustomStep`; `resolveAgent`, `modelFor`, `effortFor`,
  `toolsFor`, `saveAgent`, `resetAgent`, `listAgents` handle a custom id (defaults from D3, default prompt from the
  table). `agents.ts` is at 262 lines: put the custom branch in `custom-agent-config.ts` and call into it.
- `agent-tools.ts`: `validateTools` refuses the D2 write tools for a custom agent; `agentsUsingTool` already reads
  `agent_configs`, so it covers them.
- `prompt-writer.ts` (new, pure): the writer's prompt and reading its answer back. The prompt gives the name,
  the role, what the agent receives (the shared and project instructions, the ticket, the approved outputs of the
  steps before it; the diff when it runs after `implement`), that it writes markdown only and changes no file,
  and two built-in prompts (`technical`, `final_review`) as examples of the house style: short imperative
  instructions ending with "Output one section starting with `## <Name>`". The answer is the prompt alone: fences
  stripped, refused when empty or over a length limit (a named constant).
- `flows.ts`: `flowProblems` takes the known custom ids: built-in steps keep pipeline order, custom steps sit
  anywhere before `final_review` (D1), no repeats, `implement` and `final_review` still required, unknown or
  deleted custom ids refused. `flowNote` unchanged (it only names skipped planning steps).
- `event-payloads.ts`, `lesson-input.ts`, notifications: check every place that validates a step against
  `STEPS`/`PLANNING_STEPS` and accept a custom one where it makes sense (step approved/failed events: yes; lessons
  per custom step: yes, it is a step like the others).
- Tests: `states.test.ts` (a flow with a custom step between `technical` and `implement`: approve goes to it, then
  to `implement`; one after `implement` chains to `final_review`), `flows.test.ts` (placement rules),
  `prompt-writer.test.ts`, `custom-agents.test.ts` (delete refused while used).

## Worker (`apps/worker`)

- `prompt-writer-run.ts` (new): claims queued custom agents and runs the writer in a throwaway container, on the
  shared run slots, like `lesson-writer-run.ts` (reuse `throwaway-runs.ts`). Runs on Sonnet (prompt quality matters,
  and it runs once per agent), tools `Read` only: everything it needs is in its prompt. Logs
  `custom_agent_prompt_ready` or `custom_agent_prompt_failed` (declared in `event-payloads.ts`), which the
  page follows over SSE. A worker stopped mid-run sets `running` rows back to `queued` on start.
- `executor.ts`: a custom step goes down the planning path (`isPlanningStep(step) || isCustomStep(step)`) with
  `resolveAgent(db, step)`. Placed after `implement`, it gets the same "read the diff from the base branch" context
  the final review gets (base branch name in the prompt).
- `approved.ts`: `approvedBefore` follows the **ticket's flow order**, not `STEPS`, so a custom step's approved
  output reaches the steps after it, and `final_review` sees an after-implement custom step's report.
- `github/render.ts`: the issue comment's heading uses `stepTitle`.
- Check `scheduler.ts` and `dispatch` for `STEPS` lookups that would drop a custom step.

## Web (`apps/web`)

API (`src/routes/agents.ts`, near its limit: new `custom-agents.ts` route file):

- `POST /api/agents/custom` `{ name, role }` → creates the row, `promptStatus: 'queued'` (a plain record write; the
  worker picks it up, like lesson suggestions).
- `PATCH /api/agents/custom/:id` `{ name?, role? }`; `POST /api/agents/custom/:id/regenerate`;
  `DELETE /api/agents/custom/:id` (409 with the presets and tickets that use it).
- `GET /api/agents` includes the custom agents with `name`, `role`, `promptStatus`.
- The existing save/reset routes accept a custom agent id.

Client:

- `union-settings/new-agent-dialog.tsx`: name + role textarea, Save. Opened from the Models page and the menu.
- `union-settings-groups.ts`: a "Custom agents" group built from the agent list (today the groups are a constant;
  the custom part is dynamic, so `isUnionSection` accepts `agent_<id>` of a known agent).
- `agents/agent-page.tsx`: for a custom agent, a **Role** card above the prompt (edit + Regenerate), the writing
  status while queued/running, the writer's error with Retry, and Delete in a danger zone.
- Models page: custom agents as rows like the others.
- `settings/flows-section.tsx` + `flow-preset-row.tsx`: the preset's steps as an ordered list; the user adds a
  custom agent from a menu and moves it up/down within what D1 allows; built-in steps keep their checkbox and
  fixed order. `flow-picker.tsx` (ticket Custom) gets the same.
- `ticket-tabs.tsx`, `run-table.tsx`, `log-tab.tsx`: titles through `stepTitle`.

## Steps

1. Core: `CustomStep`, `nextStep` by flow order, `stepTitle`, table + migration, `custom-agents.ts`, agent
   resolution, flow rules, tool rule; tests.
2. Worker: `approvedBefore` by flow order, custom steps in the executor, issue comment title. Verify with a
   real Docker run on ticket 9001 (a flow with a custom step) — uses Claude usage, ask first.
3. Worker: the prompt writer run and its event.
4. Web API: create, edit, regenerate, delete; agent routes accept custom ids.
5. Web client: New agent dialog, custom agent page, Models rows, menu group.
6. Web client: ordering custom agents in flow presets and the ticket's Custom flow; titles everywhere.
7. Spec (`docs/spec/flow.md`, `ticket-flows.md`, a short `custom-agents.md`), `docs/architecture/*`, maps.

## Risks

- Widening `Step` touches many files (23 use the type, 15 read `STEP_TITLES`); the template-literal type keeps the
  compiler pointing at each one rather than hiding them behind `string`.
- `approvedBefore` and `nextStep` switching from `STEPS` order to flow order must give the same result for the
  existing flows: the existing `states.test.ts` cases with `FULL_FLOW` and the presets guard that.
- A ticket's flow is fixed on start but the agent's prompt is read on each run (as for built-ins): editing a custom
  agent changes its next run on running tickets. Same behaviour as today; say so on its page.
- The writer may produce a vague prompt from a vague role: the page shows the prompt for review before any ticket
  uses it, and the agent cannot be added to a flow until `promptStatus` is `ready`.

## Later

- Code-changing custom steps (after `implement`, with the checks and push of `runCodeStep`).
- Per-project custom agents, or a project-level prompt override of a global one.
- The writer also proposes tools and a model from the role.
- A custom agent as a "Review with agent" kind, or run on demand from a ticket like Simplify.
- Auto-approve a custom step (with flows' auto-approve, see `ticket-flows.md`).
