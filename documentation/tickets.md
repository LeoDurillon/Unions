# The board and tickets

Each project has a board with five columns. Union keeps it in step with the GitHub Project in both directions.

| Column              | What is in it                                                                    |
| ------------------- | -------------------------------------------------------------------------------- |
| **Backlog**         | Tickets that have not started.                                                   |
| **In progress**     | Tickets whose planning or implementation is running or waiting for you.          |
| **In review**       | Tickets at the final review, or running a rebase or another branch operation.    |
| **Done**            | Tickets whose final review you approved. Their pull request is ready for review. |
| **Merged / Closed** | Done tickets whose pull request was merged or closed in the last three weeks.    |

Each card shows the ticket's state ("Needs review · Technical", "Running · Implementation"), its issue number, the
ticket it depends on, and the CI checks of its pull request. Fold a column you do not need with its arrow.

Above the board:

- **Search** finds tickets by title, issue number (`#36`) or pull request number.
- **Needs you** shows only the tickets waiting for you, with their count: a step to approve, a question to answer,
  a failed run.

## Create a ticket

Click **New ticket** in the project bar. The dialog has one tab per source:

- **Write**: a title and a description in Markdown. The description becomes the GitHub issue's body, so write it
  for the agents and for your colleagues: the problem, what you expect, and anything they must not change.
- **From GitHub**: the number or URL of an existing issue of the repository. The ticket uses that issue
  instead of creating one, and keeps following its title and description on GitHub.
- **From Notion** (when the project is connected to Notion): a page of the connected data source. Union
  copies its text and images. Click **Edit before creating** to change the text first.

In every tab you can also:

- attach **files** (screenshots, specs, sample data), which the agents can read;
- pick the ticket it **depends on** (see below);
- pick its **flow** (see below).

The new ticket lands in Backlog, and Union creates its GitHub issue and adds it to the Project.

To change the title or description later, use **Edit** in the ticket's **Overview**. Union writes the change to the
issue, unless someone changed the issue on GitHub after you started editing: then nothing is written, and Union
says so. Steps that already ran do not run again.

## Start a ticket

Drag the card to **In progress**, or click **Start** on the card or in the ticket's Overview. Moving the item to In
Progress on GitHub works too.

Union creates the ticket's container and volumes, clones the repository into it, and runs the first step of the
ticket's flow. What happens next is in [From ticket to pull request](ticket-lifecycle.md).

## Flows

A flow is the list of steps a ticket runs. Implementation and the final review always run; the planning steps and
your [custom agents](agents.md#custom-agents) are optional. Steps a flow skips never run, so they cost nothing.

| Preset       | Steps                                                               |
| ------------ | ------------------------------------------------------------------- |
| **Full**     | Intake, Summary, Technical, Test plan, Implementation, Final review |
| **Standard** | Technical, Implementation, Final review                             |
| **Quick**    | Implementation, Final review                                        |

- Pick a flow in the New ticket dialog, or in the **Flow** row of the Overview while the ticket is in Backlog.
  **Custom** lets you choose the planning steps one by one and place custom agents.
- A ticket that picked none follows the project's default flow (Full, unless you change it).
- Edit the presets and choose the default in **Settings → Flows**.
- Starting a ticket fixes its flow: changing a preset later never changes a ticket that already started.

Use Quick for small, well-described changes, and Full when the request is vague and you want the agent to ask
questions first.

## Dependencies

A ticket can depend on one other ticket of the same project, its **parent**. Set it in the New ticket dialog, or in
the Overview while the ticket is in Backlog.

- The ticket cannot start until its parent is **Done**. Its card says "Waiting for parent" and cannot be dragged.
- It then starts from the parent's branch while the parent's pull request is open, and its own pull request targets
  that branch. If the parent's pull request is already merged, it starts from the project's base branch.
- Every agent of the ticket reads the parent's title and description.
- On GitHub, the ticket's issue is marked "blocked by" the parent's issue.

When the parent's pull request is merged and GitHub deletes its branch, GitHub moves the child's pull request onto
the next base, and Union follows. See [Branches and pull requests](branches.md#when-the-base-moves-on-github).

To start from another branch than the automatic one, pick it in the Overview's **Base branch** row before the
ticket starts.

## The ticket panel

Click a card to open its panel:

- **Overview**: the description, where the ticket comes from, its parent and the tickets that build on it, its
  files, the base branch and flow, the **Start** and **Cancel ticket** buttons, and every run with its model,
  duration and token usage.
- **Preview**: the ticket's [preview environment](previews.md), its end-to-end tests and commands.
- **Worker**: one tab per step with the agent's output, then the **Log**, which shows what the agent does live.
- **PR**: the ticket's pull request, its CI checks and branch operations. See
  [Branches and pull requests](branches.md).

**Investigate** in the panel header asks an agent a question about this ticket's workspace (see
[Investigations](investigations.md)). **Review changes** opens the diff (see [Reviewing changes](reviewing.md)).

## Cancel and remove

**Cancel ticket** stops the ticket: a running step is stopped, and the card goes back to Backlog marked
**Cancelled**. A cancelled ticket can then leave Union with **Remove for good**, in its Overview: its runs, outputs
and files are deleted, and its container and volumes removed. Nothing brings it back. The GitHub issue, and any
branch or pull request, stay on GitHub.
