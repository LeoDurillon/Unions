# Custom agents

Built. Design and steps: [`docs/plans/custom-agents.md`](../plans/custom-agents.md). In short:

- The user adds an agent of their own (Union settings → New agent): a name and a role in their words ("Check the
  plan for security risks"). The worker's prompt writer (Sonnet, a throwaway container, no repository) turns the
  role into the agent's default prompt, in the style of the built-in ones; the page shows "Writing the prompt…"
  until it is done, and its error with Retry when it fails.
- A custom agent's page is a built-in one's (prompt, model, effort, tools, Reset) plus its role, **Regenerate**
  (the writer again; it replaces the default prompt, a prompt the user saved stays until Reset) and Delete.
  Defaults: Sonnet, the CLI's effort, the review tools (`Read`, `Grep`, `Glob`, read-only git). It never commits:
  `Edit`, `Write`, `NotebookEdit` and bare `Bash` are refused.
- It runs only where a flow places it (project settings → Flows, or a ticket's Custom flow): anywhere before the
  final review, once, and only after its prompt was written. It runs like a planning step: a markdown report in
  its own tab, Approve or Request changes, an issue comment under its name, and its approved report goes to the
  steps after it. Placed after the implementation, it is told the branch is checked out and how to read the diff.
  Changes asked at the final review go to the implementer and the final review again, not back through it.
- Agents are global; flows are per project. Edits apply to the agent's next run, on running tickets too, since a
  ticket fixes its flow on start but reads prompts on each run.
- Deleting is refused while a project's preset or a ticket not yet done runs it; then it is soft: finished tickets
  keep its tab, runs and comment under its name.
- Not built: code-changing custom agents, per-project agents, the writer proposing tools or a model, custom agents
  as review agents, lessons and event-rule triggers for a custom step in the UI (the API accepts them).
