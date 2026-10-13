# Plan: groups of tickets

Status: planned, not started. Decisions at the end are still to confirm.

## Why

Splitting a PR into a stack ([pr-stack-split.md](pr-stack-split.md)) shows a mismatch in the model. What the outside world sees is one
item: the GitHub issue, the Notion page, the title, the Merged column. What Union executes is several pieces: branches,
PRs, reviews. Both are a ticket today.

Groups separate the two. The **group** is what the board shows and what GitHub and Notion know. The **ticket** stays
what an agent works on: branch, container, PR, review. Every group has at least one ticket, so every existing ticket
becomes a group of one and nothing changes for them.

Order of work:

1. Groups (this plan).
2. [Splitting a ready-for-review PR into a stack](pr-stack-split.md): the slices become tickets of the group.
3. [Restacking](restack.md) after a slice merges or is revised.

## Model

- New table `ticket_groups`: `id`, `project_id` (cascade with the project), timestamps.
- Tickets gain `group_id` and `group_position`. The **lead** is position 0. In v1 the lead keeps holding the issue,
  the Project item and the Notion page; the group reads them from it, so those columns do not move yet.
- Migration: each existing ticket gets its own group at position 0.
- The group's title is the lead's title (already kept in sync with the GitHub issue).
- Groups are not dependencies; parent links keep that role. Adding a ticket to a group offers "after the group's last
  ticket" (sets the parent), ticked by default.

## Core (`packages/core`)

- `createTicket` creates a group of one, unless given a `groupId` (then the ticket goes at the end).
- `groups.ts`: `groupOf`, `groupTickets` (ordered), `groupLead`.
- Browser-safe rules, tested:
  - `groupColumn`: the column of its least advanced ticket, ignoring cancelled ones; Merged only when every remaining
    PR is merged.
  - `groupLeftBoard`: off the board 21 days after the last merge.
  - `groupBoardStatus`: the status sent to the GitHub Project (Merged → Done).
- Removal: removing a lead is refused while the group has other tickets (the lead holds the issue); removing the last
  ticket removes the group.

## Board and panels (web)

- `GET /api/tickets` gains `groupId` and `groupPosition`; the client groups. No new list endpoint.
- A group of one shows today's card unchanged.
- A group of several: the lead's title, one line per ticket (state badge, PR number), a summary like "2/4 merged".
- Dragging a group into In progress starts its first backlog ticket that is not blocked; draggable only if there is one.
- Clicking a group of several opens a group panel: its tickets in order with phase, PR, checks and "behind by". A
  ticket opens today's ticket panel, with "← group" to come back. URL: `?group=3`, then `?group=3&ticket=7`.
- "Add ticket to this group" in the group panel and in a single ticket's Overview (how a group of one grows): the usual
  new-ticket form plus the "after the last ticket" box.
- Not in v1: moving an existing ticket into a group (it already has its own GitHub issue).

## GitHub sync and PRs (worker)

- Only the lead gets an issue and a Project item; the sync skips the other tickets.
- The lead's Project item shows the group's status.
- "Moved to In Progress" on GitHub starts the group, like a drag.
- Step comments of the other tickets go on the lead's issue (markers already carry the ticket id); the heading names
  the ticket: `### Summary · <title> · v2`.
- Branch names of tickets without an issue use the group's issue number: `12-<their-slug>`.
- In a group of several, each PR says "Part of #12" instead of "Closes #12", and the worker closes the issue once
  every PR of the group is merged. A group of one keeps "Closes #12".
- The "blocked by" link on GitHub stays between issues (leads only).

## Event rules

- Rules still fire per ticket, but write to the group's Notion page (the lead's). "PR linked" therefore also fires for
  the other tickets' PRs, with `{pr.url}` that ticket's PR.
- New trigger "Every PR of the group is merged" (for "set Notion to Done when it is all merged").

## Delivery

Three commits, each passing `bun run check`:

1. Schema, migration, core functions and tests. No visible change.
2. Board grouping, group card, group panel, "Add ticket to this group", drag to start.
3. GitHub sync, branch names, "Part of" and closing the issue, events through the lead's page, the new trigger,
   AGENTS.md.

Commits 1 and 3 touch core and the worker: check that no run is active before editing (the compose worker reloads on
save and restarts in-flight runs).

## Decisions to confirm

1. The group's title is the lead's title (no separate title).
2. Step comments of the other tickets go on the lead's issue (alternative: no step comments on GitHub for them).
3. A group of several uses "Part of #n", and Union closes the issue when everything is merged.
4. No moving existing tickets into a group in v1.
5. The "Every PR of the group is merged" trigger now, or later.

## Later steps

- [Splitting a PR into a stack](pr-stack-split.md): the slices become tickets of the group.
- [Restacking](restack.md) after a slice is revised or merged.
