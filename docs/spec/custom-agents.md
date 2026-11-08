# Custom agents

Built. Design and steps: [`docs/plans/archive/custom-agents.md`](../plans/archive/custom-agents.md) (ticket steps) and
[`docs/plans/archive/custom-review-agents.md`](../plans/archive/custom-review-agents.md) (review agents). In short:

- The user adds an agent of their own (Union settings → New agent): a **kind**, a name and a role in their words
  ("Check the plan for security risks"). The kind is fixed at creation (`custom_agents.kind`): a **ticket step**,
  placed in flows, or a **review agent**, run on demand from a review page. The worker's prompt writer (Sonnet, a
  throwaway container, no repository) turns the role into the agent's default prompt, in the style of the built-in
  ones and told what the kind receives; the page shows "Writing the prompt…" until it is done, and its error with
  Retry when it fails.
- A custom agent's page is a built-in one's (prompt, model, effort, tools, Reset) plus its role, **Regenerate**
  (the writer again; it replaces the default prompt, a prompt the user saved stays until Reset) and Delete. The
  Union settings menu lists ticket steps under **Custom agents** and review agents under **Review agents**.
  Defaults: Sonnet, the CLI's effort, the review tools (`Read`, `Grep`, `Glob`, read-only git), plus bare `Bash` for
  a review agent. `Edit`, `Write` and `NotebookEdit` are always refused; bare `Bash` is refused for a ticket step.
- Agents are global; flows are per project. Edits apply to the agent's next run, on running tickets too, since a
  ticket fixes its flow on start but reads prompts on each run.

## Ticket steps

- A ticket step runs only where a flow places it (project settings → Flows, or a ticket's Custom flow): anywhere
  before the final review, once, and only after its prompt was written. A flow never offers a review agent.
- It runs like a planning step: a markdown report in its own tab, Approve or Request changes, an issue comment
  under its name, and its approved report goes to the steps after it. Placed after the implementation, it is told
  the branch is checked out and how to read the diff. Changes asked at the final review go to the implementer and
  the final review again, not back through it.
- Deleting is refused while a project's preset or a ticket not yet done runs it; then it is soft: finished tickets
  keep its tab, runs and comment under its name.

## Review agents

- The review page of a ticket's branch or of a pull request under review has an **Agents** tab after Report: a
  picker of the review agents whose prompt is written, **Run agent**, then one card per agent with its newest run on
  the change. One run at a time per change, whatever the agent (`review_agent_runs`); refused while the change
  cannot be read (a ticket running a step, a pull request whose files are not read yet).
- A run reads the review's specs as the Specs bar shows them (none needed), the change (`git diff <base>...HEAD`, the
  changed files, the hunk index) and its commits, the project's instructions and the agent's lessons
  (`agent_<id>`), then the agent's prompt; the host always appends how to cite code (`path:line`,
  `path:start-end`) and to name the checks it could not run.
- It runs in its own throwaway container (`union-v<id>`), never the ticket's: a pull request cloned from GitHub at
  the reviewed commit, a ticket's branch and its base copied from a bundle of the ticket's container. `origin` is
  the public URL and the container holds no GitHub credentials, so nothing is pushed or posted. The project's
  files and its install command go in first, then the agent may build and test there. A pull request from a fork
  gets neither, and the agent is told not to run its code.
- The answer is markdown, shown as is. An inline code span naming a file of the change (`path`, `path:12`,
  `path:12-30`) is a link that opens the Diff tab on those lines; any other span stays code. The card says which
  specs the run read and when the change moved since; **Cancel** while it works, then **Run again** (it replaces
  the agent's previous run on the change) and **Copy as markdown**.
- Deleting is refused while one of its runs waits or runs; it is soft, and its runs keep their answers under its
  name.

## Not built

Code-changing custom agents, per-project agents, the writer proposing tools or a model, lessons and event-rule
triggers for a custom step in the UI (the API accepts them), and for review agents: draft comments from their
findings, agent services (a database) beside a run, several runs at once on one change, the repository's other
branches for conflict checks on a private repository.
