# Plan: notifications in Union

Status: built (2026-10-16), steps 1 to 5. Replaces the outgoing webhook of [Events v2](events-v2.md) for now: no
external service to connect, and what needs the user is told inside Union.

## Why

A ticket that waits for approval, fails or hits the usage limit says so only on its card. The user has to watch the
board to notice. Notifications gather those moments in one inbox, with an unread count, and optionally as desktop
notifications while Union is in a background tab.

## What notifies

Built in, nothing to set up. Each comes from one event of the log (`packages/core/src/event-payloads.ts`):

| Moment                                             | Event                                          |
| -------------------------------------------------- | ---------------------------------------------- |
| A step waits for approval                          | `phase_changed` to `awaiting_approval`         |
| A step failed, a commit was refused                | `phase_changed` to `failed` / `commit_refused` |
| Paused by the usage limit                          | `phase_changed` to `rate_limited`              |
| A start blocked by an unfinished parent            | `start_blocked`                                |
| The PR was merged or closed                        | `pull_request_merged` / `pull_request_closed`  |
| The PR's CI checks turned red                      | `pull_request_checks_failed`                   |
| An investigation finished or failed                | `investigation_finished`                       |
| An event rule failed (Notion or GitHub refused it) | `event_rule_applied` with status `failed`      |

Routine events (a step starting, a sync, a rule that succeeded) do not notify. One inbox for every project; each
entry names its project.

## Design

### Data

A `notifications` table: `id`, `project_id`, `ticket_id` or `investigation_id`, `kind` (the moment), `title`,
`detail`, `event_seq` (unique: one notification per event), `created_at`, `read_at` (null: unread). New migration.

### Writing (worker)

- A pure function in core, `notificationFor(event, ticket | investigation) → draft | null`, decides which events
  notify and with what text. Unit-tested next to it.
- The worker follows the log with its own cursor (`event_cursors`, name `notifications`), like the rule deliveries
  (`event-deliveries.ts`): it starts at the end of the log (no notifications for the past) and writes one row per
  matching event. Ticked from `side-runs.ts` with the event dispatcher.
- Each new row logs a `notification_created` event (declared in `event-payloads.ts`), so the browser hears of it
  on the shared stream.

### Reading (web)

- `GET /api/notifications` (newest first, a page; unread count), `POST /api/notifications/:id/read`,
  `POST /api/notifications/read-all`. Marking read is a plain record write, which the web may do.
- Read notifications older than some weeks can be deleted by the worker later (not in the first version).

### UI

- A bell in the sidebar (`sidebar.tsx`), above the projects: the unread count, also in the tab title
  (`(3) Union`).
- Its panel: newest first, unread ones marked. A click opens the ticket or the investigation and marks it read;
  "Mark all read".
- The list refetches on `notification_created` (`use-live-invalidation.ts`).
- Desktop notifications, off until the user turns them on (the browser asks for permission; `localhost` needs no
  HTTPS). Only the tab that holds the shared stream (`event-hub.ts`, the Web Lock holder) shows them, so several
  tabs do not show the same one. Clicking one focuses Union and opens the ticket.

## Steps

1. Core: the table and migration, `notificationFor` with its tests, the `notification_created` event type.
2. Worker: the cursor and the writer; tests on a log of events.
3. Web: the three routes, with tests.
4. UI: the bell, the panel, the tab title; a UI check with writes blocked.
5. Desktop notifications behind the opt-in.

## Later

- A "Notify me in Union" action kind for event rules, for custom moments ("ticket X moves to Done"). Built
  (2026-10-16): action kind `union_notification`, notification kind `rule` with its `rule_id`.
- Choosing which built-in moments notify, per project.
