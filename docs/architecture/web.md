# apps/web

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

`apps/web`: Hono API and React/Vite SPA, served by one Bun process in production.

- `src/app.ts` is `createApp(db)`; routes live in `src/routes/` (`projects`, `tickets`, `events`); `src/server.ts`
  only wires the DB and `Bun.serve`. `src/api-types.ts` holds the response shapes shared with the client.
- Setup is a wizard (`components/onboarding/`: Connect, Repository, Project, Notion, Review) shown over the board
  on first run and from "Add project". Connect takes a token or an installation of the GitHub App
  (`components/github-app/`, also a global page in the sidebar). The board columns fill the viewport height; each column scrolls itself.
  A ticket whose PR is merged or closed (`pr_state`, polled by the worker) is in the Union-only Merged / Closed column
  (`boardColumn`), its card tagged Merged or Closed, for 21 days after `pr_merged_at` or `pr_closed_at`, then leaves the
  board (`leftBoard`); the GitHub Project still sees it as Done. A closed PR is still polled: reopened, the ticket goes back.
- Code review: after each implementation run the worker stores the branch diff (`diff-snapshot.ts`,
  `diff_snapshots`/`diff_files`, newest only). The web reads it from SQLite (`routes/review.ts`), never from Docker or
  GitHub; `components/review/` renders one file at a time, unified or split (`lib/split-rows.ts` pairs the lines),
  highlighted by lowlight per hunk side (`lib/highlight.ts`). Line comments are drafts in `review_comments` until
  sent; sending formats them (`review-feedback.ts`) into a normal `revise` command. The ticket panel's PR tab
  (`pull-request-tab.tsx`, `pull-request/`) shows the linked PR's discussion (`OnboardingGitHub.getDiscussion`,
  `github-discussion.ts`); `routes/review-import.ts` and `review-import.ts` import threads (line drafts) and single
  review summaries or comments (`general` drafts). A pull request under review (Current reviews tab) uses the same
  page and comment code: `review_comments` rows belong to a ticket or to a `current_reviews` row
  (`routes/review-comments.ts`, `routes/pr-review.ts`), and the client reviews a `ReviewTarget`
  (`lib/review-target.ts`), whose base URL serves the diff, the comments and the send. Files matching the project's
  review ignore rules (`isIgnoredPath` in `@union/core/diff`: built-in lock files plus `config.reviewIgnore`
  gitignore-style patterns) are flagged `ignored` and listed apart, never dropped. `@union/core/diff` parses diffs and
  is browser-safe. A pull request's review can show one commit at a time (`commit-picker.tsx`, `commit-diff.tsx`,
  `routes/pr-commits.ts`: the PR's commits and a commit's files against its first parent, read from GitHub and kept
  by SHA in memory); that view is read only, comments are written on all the changes. A ticket's review has the same
  view from SQLite: `captureDiff` also keeps each commit of `base..HEAD` with its own files (`diff-commits.ts`,
  `diff_commits`/`diff_commit_files`, newest 100) and, once the user has sent a review (`tickets.reviewed_sha`, the
  snapshot's head then), the change since that head while it is still in the branch (`routes/ticket-commits.ts`,
  `since-review`).
- Project settings are a page, not a modal: `?settings=<section>` (`lib/settings-sections.ts` lists the sections
  and their groups; `openSettings(section)` links to one from anywhere), `components/settings/settings-page.tsx`
  with a grouped side menu.
- One Save per settings page: a page's form is `useSettingsForm` (`lib/use-settings-form.ts`, unsaved = differs
  from what was loaded or last saved there) and its Save bar is `components/settings/save-bar.tsx`, sticky at the
  bottom. A form with changes registers with `useLeaveGuard` (`lib/leave-guard.ts`): `openSettings`,
  `closeSettings` (which leaving to another page or project goes through), browser back/forward and reload ask
  before throwing it away. What applies at once by nature keeps its own button and only guards what is typed:
  credentials verified before they are stored (GitHub token or installation), secrets, file uploads, event rules
  (records, each with its editor), Turn previews off, Disconnect, deleting the project.
- Event rules (project settings → Events → Rules, `routes/event-rules.ts`): when something happens to a ticket,
  do one action. The kinds are in the browser-safe `@union/core/event-actions`: comment on the ticket's GitHub
  issue or pull request (the rule picks which), change the ticket's pull request (labels to add and remove,
  reviewers, assignees, title, a description section; one of each, `event-pull-request-action.ts`, browser-safe as
  `@union/core/event-pull-request`; the editor suggests the repo's labels and assignable users from
  `GET /api/projects/:projectId/github/rule-choices`, read live through `OnboardingGitHub.listRuleChoices`), set
  fields of the ticket's GitHub Project item, its issue's or its pull request's (`event-project-fields-action.ts`;
  single select, text, number, date; Status on the issue's item is refused, Union's sync sets it; the editor reads
  the fields live from `github/project-fields`, and the rule keeps each field's id, name and type), notify
  the user in Union (a message template, shown under the
  ticket's title in the bell, kind `rule`), or set one or more properties of the Notion page it was
  imported from (`values: [{ propertyId, value }]`, each property once; `event-notion-action.ts`)
  (`tickets.notion_page_id`, set by the import; older imports are
  linked from their "Imported from Notion:" line by `backfillNotionPages` at worker start). Notion rules point at
  properties by id in the stored copy of the data source's columns (`notion_data_sources`, read again on connect
  or "Refresh from Notion") and are checked against it on save. Triggers, variables and Notion value shapes are in
  the browser-safe `@union/core/event-rules`; matching and the delivery queue in `event-rules.ts` and
  `event-deliveries.ts`. Rules apply only to events logged after their creation (no replay).
- Notifications: the bell above the projects in the sidebar (`components/notifications/`) shows the unread count
  (also in the tab title) and opens a panel of every project's notifications, newest first
  (`routes/notifications.ts`: `GET /api/notifications?before=`, `POST /:id/read`, `POST /read-all`; marking read
  is a plain record write; mounted with the event stream in `routes/live.ts`). The worker writes them; the list
  refetches on `notification_created`. A click opens the ticket's panel or the investigation
  (`?investigation=<id>`, `lib/opened-investigation.ts`) in its project and marks it read
  (`lib/open-notification.ts`). Desktop notifications are off until turned on in the panel (stored in
  localStorage; the browser asks permission): only the tab holding the shared stream shows them
  (`subscribeAsLead` in `lib/event-hub.ts`), and only while Union is not in view.
- Agent review comments: "Review with agent" on either review page queues an `agent_reviews` row
  (`routes/agent-review.ts`, `@union/core` `agent-reviews.ts`). Its findings become drafts with `author: 'agent'`
  (badge "suggested", Keep button); keeping or editing one makes it the user's (`author: 'user'`), and a new
  successful run replaces only the agent's untouched drafts. Nothing is sent: the drafts go out with the usual
  send. Its prompt and model are the `review_comments` agent in Agent settings; `final_review` is unrelated.
- Grouping by spec: "Group by spec" on either review page (`group-by-spec-dialog.tsx`) reads a specification
  (`routes/spec-sources.ts`: the PR description without Union's links, the ticket's text, a GitHub issue, any
  Notion page the integration can read), lets the user edit it, and queues a `review_groupings` row
  (`routes/review-groupings.ts`, `grouping-targets.ts`; `@union/core` `review-groupings.ts`). The worker's
  `ReviewGroupingRunner` (`review-grouping.ts`, same slots and checkout as the agent review, PR containers
  `union-g<id>`) runs the `review_groups` agent; `review-grouping-result.ts` keeps only changed files, puts the ones
  left out under "not in the spec" and empty groups under "missing". Groups place hunks: the host writes the diff's
  hunks to `.git/union-review-hunks.md` in the checkout (`review-grouping-format.ts`), the agent names whole files
  or hunks by their new-side start line, and the parser maps each line to the stored hunk around it (`hunkAt` in
  the browser-safe `@union/core/diff-hunks`; keys like `-12+14`), so `SpecGroup.hunks` lists the files a part takes
  only in part and every hunk is placed at least once. Only the newest grouping is kept; it is outdated when the
  review's head commit moved. The file panel's "By spec" toggle (`spec-groups.tsx`, independent of List/Tree) shows
  the files under their groups; a file opened under a part shows only that part's hunks (`hunk-focus.tsx`,
  `lib/spec-hunks.ts`, "Show all" to see the rest) with each hunk header tagged with its parts, except on an
  outdated grouping.
- Previews: project settings → Preview (`routes/preview-settings.ts`, `config.preview`: compose file, service,
  port, plain variables) and the ticket Overview's Preview section (`preview-section.tsx`, `routes/preview.ts`,
  state in the `previews` table). Start, stop and logs are commands; the worker owns Docker.
- PR description rewrite: the PR tab's Description section (`pull-request/pr-description.tsx`,
  `routes/pr-description.ts`, `@union/core` `pr-descriptions.ts`) queues a `pr_descriptions` row. The agent's draft
  is the user's to edit, send or discard; sending is the `update_pr_description` command. "Outdated" means a
  `branch_pushed` event came after the last `pull_request_opened` or `pr_description_sent`. Union's links ("Closes
  #n", the PR it builds on) are never part of the draft: `withoutUnionLinks` strips them, `pullRequestBody` adds them
  back.
- `client/` is the SPA: Tailwind v4, TanStack Query, dnd-kit. `app.tsx` is the shell, `components/` the UI,
  `lib/` the hooks and the typed `api.ts`. The browser keeps one event stream for all its Union tabs
  (`lib/event-hub.ts`: the tab holding the Web Lock `union-events` reads `/api/events` and relays each event
  over a BroadcastChannel; browsers allow six connections per host, and a stream per tab or log used to leave
  clicks waiting). The board and ticket panel refetch on its events (`use-live-invalidation.ts`); the Log tabs
  poll `/api/events/log` every second while open (`use-log.ts`): the ticket's or investigation's events and its
  agents' output (`agent_log`) in one order, from a cursor. Agent output is not on the stream. Events are sent unnamed: a new event type reaches
  the client without being listed.
- Dev: `bun run dev:web` (Vite on 5173 proxies `/api` to Hono on 3000). Production: build, then start (below).
