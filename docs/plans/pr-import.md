# Import a pull request as a ticket

Status: built (branch `pr-import`, 2026-11-08), steps 1 to 4; not yet run against a real pull request.
Replaces [Prefill steps on GitHub issue import](issue-import-prefill.md): picking up Union's earlier work on an
issue is done through the pull request that closes it.

## Why

A pull request opened outside Union, or by Union before a database reset, cannot be worked on from a ticket today:
importing its issue starts a new ticket at the first step, on a new branch named like the old one. Importing the
pull request itself gives a ticket on the pull request's branch, ready for the final review or a revision.

## What exists

- Linking a pull request to a ticket (`ticket-pull-request.ts`) sets `prNumber`; publishing keeps a linked pull
  request instead of opening one (`publish.ts`).
- `implement-run.ts` uses `ticket.branch` when set, and `ensureBranch` checks out `origin/<branch>` (the clone has
  every branch). The final review checks the branch out too.
- An implementation run with no session gets the full prompt and the feedback (`freshPrompt`): a Revise works on a
  ticket whose implementation Union never ran.
- `pushedSha` is what the poll compares the pull request's head with: set to the head at import, a later push by
  someone else shows as a move, with **Resync from GitHub**.
- The step comments Union leaves on an issue: a hidden marker `<!-- union:ticket=12 step=summary -->`, a heading
  `### Summary · v2 · approved`, the content, then the revision feedback folded (`apps/worker/src/github/render.ts`).

## Design

**Read (web, read only).** One GraphQL query: the pull request (title, body, draft, state, head and base branch,
head commit, whether it comes from a fork) and the issues it closes (`closingIssuesReferences`, which also has
issues linked by hand), each with its last 100 comments. Refused: a closed or merged pull request, one from a fork
(the host cannot push to it), one or an issue already on a ticket of the project.

**Prefill.** The first linked issue with a Union step comment is the ticket's issue. Its comments are parsed by
core's `issue-step-comments.ts` (pure): step, version, validation and content. Only the built-in planning steps are
kept (a custom agent's id may not exist any more); a step's last comment wins.

**The ticket.**

|                       | Issue with Union's comments                                    | Otherwise                           |
| --------------------- | -------------------------------------------------------------- | ----------------------------------- |
| Title and description | the issue's (it keeps owning them), Union's markers removed    | the pull request's                  |
| Issue                 | that issue                                                     | the first linked issue, if any      |
| Flow                  | the planning steps found, then implementation and final review | Quick: implementation, final review |
| Planning outputs      | one per step found: its version and validation, its comment id | none                                |
| Implementation output | the pull request's description (pending)                       | the same                            |

Its branch is the pull request's head, its base the pull request's base, `prNumber` and `prReadyAt` set,
`pushedSha` the head commit. A step output keeps the old comment's id with no hash, so the worker's next sync edits
that comment (with the new ticket's marker) instead of posting another.

**Where it starts.** The web queues `adopt_pull_request`; the worker applies `adopt`, a state-machine action from
the backlog to **awaiting approval at Implementation**, then checks the branch out in the ticket's container and
captures its diff, so the Changes tab shows the pull request (Docker, no Claude). Approve runs the final review;
Revise runs the implementer on the branch, which pushes to the pull request. Nothing runs Claude on its own.

**UI.** The New ticket dialog's GitHub tab has Issue and Pull request. The pull request preview shows its
branches, the linked issue and the steps found ("Summary v2 approved, Technical v1 awaiting review"), and the flow
the ticket gets; the flow picker does not apply.

## Steps

1. Core: the step comment parser, the `adopt` action (`states.test.ts`). Built.
2. Web: the GraphQL read, `/api/tickets/github-pull-request` (preview and create), tests on a fake GitHub. Built.
3. Worker: `adopt_pull_request` (the action, then the branch and its diff). Built.
4. Client: the Pull request choice and its preview; the user guide. Built.

## Left

- A run against a real pull request: the import, the diff, Approve (final review), a Revise pushed to it.
- Comments are trusted by their marker, whoever wrote them; checking they come from the project's GitHub identity
  (the token's user or the App's bot) is left.
- Custom agents' comments are not prefilled.
- A planning step left awaiting review on the issue is saved as it was, not approved: agents do not get it as the
  approved plan.
