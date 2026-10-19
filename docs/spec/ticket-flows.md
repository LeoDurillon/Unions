# Ticket flows

Built. Design and steps: [`docs/plans/ticket-flows.md`](../plans/ticket-flows.md). In short:

- A flow is the pipeline steps a ticket runs, in order: any of the four planning steps, the user's
  [custom agents](custom-agents.md) anywhere before the final review, and always `implement` and `final_review` (the final review's approval is what marks the PR ready, and every rebase and revision leads back
  to it). Skipped steps never run, so they cost nothing; they have no tab, no issue comment, no approval.
- Presets per project (project settings → Agents → Flows): built-in Full (every step), Standard (`technical`,
  then implementation and review) and Quick (implementation and review), or the project's own list; one is the
  default for new tickets.
- The New ticket dialog picks the flow for any source (written, GitHub issue, Notion page): a preset, or Custom
  with the planning steps chosen one by one and custom agents added and moved. The Overview's Flow row changes it while the ticket is in Backlog.
  A ticket that chose none follows the project's default until it starts.
- Starting fixes the flow on the ticket (`tickets.flow`), so editing presets later never changes a running ticket;
  tickets started before flows existed run every step. The state machine follows it on `start` and `approve`: the
  next step is the next one in the flow's own order.
- The implementer and the final review get a `# Flow` note naming the skipped planning steps: work from the ticket
  itself, and without a test plan, add (or judge) the tests the change needs.
