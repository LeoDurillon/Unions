# apps/web

<!-- Moved from AGENTS.md: read the file for the area you change; keep it current when behavior changes. -->

`apps/web`: Hono API and React/Vite SPA, served by one Bun process in production.

- `src/app.ts` is `createApp(db)`; routes live in `src/routes/` (`projects`, `tickets`, `events`); `src/server.ts`
  only wires the DB and `Bun.serve`. `src/api-types.ts` holds the response shapes shared with the client.
- Setup is a wizard (`components/onboarding/`: Connect, Repository, Project, Notion, Review) shown over the board
  on first run and from "Add project". Connect takes a token or an installation of the GitHub App
  (`components/github-app/`, also a page of the Union settings). The board columns fill the viewport height; each column scrolls itself.
  A ticket whose PR is merged or closed (`pr_state`, polled by the worker) is in the Union-only Merged / Closed column
  (`boardColumn`), its card tagged Merged or Closed, for 21 days after `pr_merged_at` or `pr_closed_at`, then leaves the
  board (`leftBoard`); the GitHub Project still sees it as Done. A closed PR is still polled: reopened, the ticket goes back.
  While the PR is open, its card shows the CI checks of its head (`pr_checks_state`, polled by the worker): Checks
  running, passed or failed, the commit in its tooltip; nothing while they are not known.
- Markdown (`components/markdown.tsx`) draws a ` ```mermaid ` block as its diagram (`mermaid-diagram.tsx`: Mermaid
  loaded on the first one, strict security, the theme following the color scheme); one that does not parse keeps its
  source under a one-line error. Above each diagram, SVG and PNG download it (`lib/diagram-export.ts`), drawn again
  in the light theme on white with SVG-text labels so a canvas can export it (`lib/mermaid-render.ts` runs renders
  one at a time, since Mermaid's settings are global); Copy source copies its Mermaid text. Agents are told they may draw them (`DIAGRAM_INSTRUCTION` in core, in the shared
  prompt and the investigation prompt); GitHub renders the same blocks in issues and pull requests.
- Flows: the New ticket dialog picks the ticket's flow above its three sources (`flow-picker.tsx`: the project's
  presets, or Custom with a chip per planning step), sent as `flow` to `POST /api/tickets` and the issue import
  (`routes/ticket-flow.ts` checks it). The default preset is sent as null, so the ticket follows the project's
  default until it starts. The Overview's Flow row (`flow-row.tsx`) changes it in Backlog
  (`PUT /api/tickets/:id/flow`, `chooseFlow` in core; 409 once started). The Worker tab shows only the flow's steps
  (and any with output), and a card names a flow that is not the full pipeline. Project settings → Agents → Flows
  (`settings/flows-section.tsx`) edits the presets and the default, saved as `flows` and `defaultFlow` through
  `PATCH /api/projects/:id` (checked by `flowSettingsChange` in core); the built-in presets are saved as none.
- Code review: after each implementation run the worker stores the branch diff (`diff-snapshot.ts`,
  `diff_snapshots`/`diff_files`, newest only). The web reads it from SQLite (`routes/review.ts`), never from Docker or
  GitHub; `components/review/` renders one file at a time, unified or split (`lib/split-rows.ts` pairs the lines),
  highlighted by lowlight per hunk side (`lib/highlight.ts`). Line comments are drafts in `review_comments` until
  sent; sending formats them (`review-feedback.ts`) into a normal `revise` command. The ticket panel's PR tab
  (`pull-request-tab.tsx`, `pull-request/`) shows the linked PR's discussion (`OnboardingGitHub.getDiscussion`,
  `github-discussion.ts`); `routes/review-import.ts` and `review-import.ts` import threads (line drafts) and single
  review summaries or comments (`general` drafts). On a split ticket, what comes from a slice's pull request is
  anchored on that slice's own diff (`slice-snapshot.ts`: `review_comments.slice_position`, `head_sha` the slice's
  tip, outdated once the slice's tip moves); `POST <ticket>/comments?slice=<n>` writes on a slice, `POST <ticket>/comments/import-stack` imports every open
  slice's threads (all read before any is imported), and the review
  page's slice tabs (`slice-tabs.tsx`, `use-slice-view.ts`) read its files from `<ticket>/commits/slice-<n>`. The picked slice lives in the URL (`?slice=<n>`, `lib/review-url.ts`, with the ticket review's section tab as `?tab=`; `CLOSE_REVIEW` clears both wherever the review closes), so Back and Forward move between slices; it is shared through `slice-pick.tsx`, so the page's PR tab shows that slice's pull request (the ticket's own under All), and picking one there picks its slice. The PR's CI checks (`routes/pr-checks.ts`,
  `/api/tickets/:id/pr-checks`) are read through `CiGitHub` (`github-checks.ts`, beside `OnboardingGitHub` in
  `ApiServices`): the head commit's check runs and statuses and the PR's bot comments; a pick (a failed check, another
  Actions job, a bot comment) is read again and turned into the implementer's text (`ci-picks.ts`, core
  `ci-output-text.ts`), previewed, kept in `ci_outputs` or sent as a `revise` command; Re-run on a failed Actions job
  queues `rerun_ci_job` (`ci-rerun.ts`, once per job while it waits). Replies to the pull request's comments
  (`routes/pr-comment-replies.ts`): `/api/tickets/:id/pr-replies` (`?pr=` for a slice) and `<review>/replies` read
  the replies (`pr-replies.ts`: the `reply_pr_comment` commands without a `pr_comment_replied`/`_failed` event yet,
  the ticket's suggested replies on that pull request, who posts) and queue a reply; the ticket's also edit, send
  (one or all) and discard suggestions (`pr-reply-commands.ts`). Send review marks the imported drafts it sends
  `reply_status = 'requested'` (`markSent`'s `askReplies`, unless `config.suggestReplies` is false). In the client,
  `lib/use-pr-replies.ts` reads them and follows the reply events, and `pull-request/reply-area.tsx` (with
  `reply-box.tsx`, `suggested-reply.tsx`) sits in each `ThreadCard` and `NoteCard` of the PR tab (`discussion.tsx`)
  and the review's Comments tab (`pull-requests/review-comments-tab.tsx`). A ticket's Notion comments
  (`routes/notion-comments.ts`): `GET` reads the page's discussions (`notion-discussions.ts`) with the
  `post_notion_comment` commands not answered yet (`notion-comment-commands.ts`), `POST` queues one, `POST /import` adds a discussion to the review (`notion-review-import.ts`:
  one `general` draft, deduped by its Notion link in `source_url`; `review-feedback.ts` puts these under "On the
  spec (Notion comments)", and `markSent` asks no reply for them); in the client,
  `lib/use-notion-comments.ts` and `notion/notion-tab.tsx`, `notion-discussion.tsx`, `notion-reply.tsx` (which
  reuses the PR tab's `reply-box.tsx`). `PUT /api/tickets/:id/text`
  (`routes/ticket-edit.ts`) queues `edit_ticket` with the new title and description and the `base` the user started
  from; it refuses a base the ticket no longer has, and a second edit while one waits. A pull request under review (Pull requests tab, Under review) uses the same
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
  Stacked pull requests are GitHub's stacks: the list route reads them with the pull requests
  (`routes/pull-request-listing.ts`, `listStacks` in `src/github-stacks.ts`, cached together) and sends each item's
  `stack` (number and place) and the open `stacks` (null where GitHub has none: the client then chains open ones by
  branch). They are one row in the Pull requests tab, in every filter, listed first under "Stacks", apart from the
  others (`pull-requests/stack-item.tsx`, `lib/pull-request-stacks.ts`), opened to list their members and name those
  not listed. "Add stack to reviews" posts `…/pull-requests/reviews/stack` (one transaction, members already
  under review skipped); a pull request whose stack has one under review says which stack it joins; a split
  ticket's slices map to its ticket, so its stack offers Open ticket. Reviews under review keep `github_stack_number` and
  `stack_position`: set from the listed item when added, written for every review when the list is read, and by
  `readReviewFiles` (`routes/pr-review-load.ts`, `pullRequestStack`) each time it reads the files.
  Each read of the list from GitHub also removes the reviews of pull requests it shows closed or merged, or misses from
  an Open list holding every open one (`routes/closed-reviews.ts`, the same cleanup as Remove); the client reads
  the reviews again after it.
  The Under review part (`pull-requests/under-review.tsx`) groups its reviews by them (`reviewStacks`): stacks first,
  one row each (`review-stack-item.tsx`; Remove posts `…/reviews/stack/remove`: every member in one transaction, or none). Opening one opens its bottom PR in the review
  page with its PRs as a segmented control under the header (`stack-review.tsx`, `stack-tabs.tsx`: draft count and posting state per
  PR, `useDraftCounts` sharing `useComments`' cache); `ReviewPage` is keyed by the PR, so switching starts on its
  first section with no file open. The open PR is `?review-pr=<n>` and its section `?tab=` (`useReviewedPullRequest`, `useReviewTab` in `lib/review-url.ts`); picking another PR clears the tab, and `workspace.tsx` switches to the Pull requests view while one is open, so a reload or Back lands there. Each PR keeps its own drafts and its own Send review (Comment, Approve or Request changes).
- Project settings are a page, not a modal: `?settings=<section>` (`lib/settings-sections.ts` lists the sections
  and their groups; `openSettings(section)` links to one from anywhere), `components/settings/settings-page.tsx`
  with a grouped side menu.
- Project settings → Agents → Memory (`settings/memory-section.tsx`, `lesson-list.tsx`, `lesson-card.tsx`, `feedback-inbox.tsx`,
  `lib/use-memory.ts`; `routes/memory.ts`): the lessons per step, saved whole with the page's Save
  (`PUT /api/projects/:id/lessons`, checked by `parseLessonsSave` in core, which also curates the feedback the new
  ones were made from), and the feedback (`GET …/feedback`; Dismiss and Back to new `PATCH …/feedback/:id` at once).
  Suggest queues the lesson writer (`POST …/lesson-suggestion`, a `lesson_suggestions` row the worker claims); the
  page polls `GET …/lesson-suggestion` while it works and shows its proposals (`settings/lesson-suggestions.tsx`).
- Union settings (sidebar → Union settings) are the same frame (`settings/settings-frame.tsx`, `settings-nav.tsx`)
  over `?union=<section>`: one page per agent (`agents/agent-page.tsx`: prompt, model, effort, tools, one Save;
  Reset to default applies at once), Models (every agent's model and effort in a table, `union-settings/models-page.tsx`;
  Save sends one `PUT /api/agents/:agent` per changed row), the custom agents (a "Custom agents" group of ticket steps and a "Review agents" group,
  `union-settings/union-nav-groups.ts`; New agent `new-agent-dialog.tsx` with the kind (`agent-kind-field.tsx`) →
  `POST /api/agents/custom` (`kind`), their page
  adds `agents/custom-agent-card.tsx`: role, Regenerate, Delete; `GET /api/agents/custom/names` names their steps
  everywhere through `lib/use-custom-agents.ts`), Tools, Connectors and the GitHub App
  (`lib/union-settings-groups.ts` lists them; `openUnionSettings(section)` links to one). The page shown is in the
  URL too (`lib/use-navigation.ts`: `?page=previews`, `?union=`, else the board), so a reload keeps it.
- One Save per settings page: a page's form is `useSettingsForm` (`lib/use-settings-form.ts`, unsaved = differs
  from what was loaded or last saved there) and its Save bar is `components/settings/save-bar.tsx`, sticky at the
  bottom. A form with changes registers with `useLeaveGuard` (`lib/leave-guard.ts`): `openSettings`,
  `closeSettings`, their Union settings counterparts (which leaving to another page or project goes through), browser back/forward and reload ask
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
  (`tickets.origin_kind` `notion` and `origin_id`, set by the import or later from the ticket's **Notion** row:
  `routes/ticket-notion-link.ts`, `POST /:id/notion/check`, `PUT` and `DELETE /:id/notion`, mounted with the
  pull request link by `ticket-outside-links.ts`; the client's `ticket-notion-row.tsx`; older imports are
  linked from their "Imported from Notion:" line by `backfillNotionPages` at worker start). Notion rules point at
  properties by id in the stored copy of the data source's columns (`integrations.fields`, read again on connect
  or "Refresh from Notion") and are checked against it on save. Triggers, variables and Notion value shapes are in
  the browser-safe `@union/core/event-rules`; matching and the delivery queue in `event-rules.ts` and
  `event-deliveries.ts`. Rules apply only to events logged after their creation (no replay).
- Notifications: the bell above the projects in the sidebar (`components/notifications/`) shows the unread count
  (also in the tab title) and opens a panel of every project's notifications, newest first
  (`routes/notifications.ts`: `GET /api/notifications?before=`, `POST /:id/read`, `POST /read-all`, `DELETE /` to
  clear them all after a confirm; marking read and clearing are plain record writes (the worker's cursor is past
  the cleared events, so they do not come back); mounted with the event stream in `routes/live.ts`). The worker writes them; the list
  refetches on `notification_created`. A click opens the ticket's panel or the investigation
  (`?investigation=<id>`, `lib/opened-investigation.ts`) in its project and marks it read
  (`lib/open-notification.ts`). Desktop notifications are off until turned on in the panel (stored in
  localStorage; the browser asks permission): only the tab holding the shared stream shows them
  (`subscribeAsLead` in `lib/event-hub.ts`), and only while Union is not in view.
- Claude usage: `GET /api/claude-limits` (`routes/claude-usage.ts`, core `claude-limits.ts`) returns the newest
  `rate_limit_event` an agent call printed (`unifiedWindows.five_hour` / `seven_day`: utilization and reset), read
  from `agent_log` (the last 20 000 lines at most). The sidebar's `usage/claude-meter.tsx` polls it every minute.
  `GET /api/projects/:projectId/usage?days=7|30|90|all` sums the project's `agent_usage` rows (its tickets' and
  its investigations') in core `project-usage.ts` and the pure `usage-summary.ts`: total, weeks (Monday, UTC),
  steps, models, the ten most expensive tickets, investigations. The project's Usage tab is
  `usage/usage-page.tsx`, its chart `usage/weeks-chart.tsx` (scale from `lib/nice-scale.ts`).
  `GET /api/projects/:projectId/usage/findings?days=…` returns core `projectFindings`: what the range shows to
  improve and the tickets it links to; `usage/usage-findings.tsx` shows it, worded by `lib/finding-text.ts`.
- Repository tab (`components/repository/`, plan in `docs/plans/repository-view.md`): the web reads GitHub itself,
  through `RepositoryGitHub` (`github-repository.ts`, an `ApiServices` member beside `ci`), wrapped by
  `CachedRepository` (`repository-cache.ts`): trees and files are named by their sha, so they are kept in memory
  (16 trees, 64 MB of files, least recently used out, `weighted-lru.ts`). `routes/repository.ts`, mounted through
  `project-github.ts`: `GET /api/projects/:projectId/repository/commit?ref=` (the base branch by default; the sha
  from `GET /commits/{ref}` with the sha media type, then `git.getCommit`; 404 when the ref names nothing),
  `…/tree?sha=` (recursive; with `&prefix=` one folder's own entries, for a tree GitHub `truncated`),
  `…/branches` (the picker's list, `{ branches, projectBase }`, through `OnboardingGitHub.listBranches`),
  `…/blob?sha=&path=&size=` (a size above core `REPOSITORY_FILE_LIMIT`, 1 MB, answers `too-large` without reading;
  core `repositoryBlob` tells text, image (a data URL) and binary), `…/raw?sha=&path=&size=` (an image's own bytes
  for `<img>` in rendered Markdown, up to `REPOSITORY_IMAGE_LIMIT`, 10 MB; images only, sent with
  `Content-Security-Policy: sandbox` and `nosniff` so an SVG opened on its own runs nothing). A Markdown file
  renders through `markdown.tsx` with GitHub's HTML (`repository/markdown-view.tsx`, Rendered / Source, reset per
  file); its `resolveUrl` (`lib/markdown-links.ts`, relative paths by `lib/repo-paths.ts`) points images of the
  commit at `raw`, links to its files at the tab's own `?view=repository&repo-path=` (a click there is caught and
  opens the file without a reload), and links to paths it lacks at GitHub. The branch picker (`repository/ref-picker.tsx`) is the ticket's
  `BranchList` (`branch-picker.tsx`) in a popup closed by `lib/use-dismiss.ts`; picking the base branch removes
  `repo-ref`. The URL holds `?view=repository&repo-ref=&repo-path=`
  (`lib/repository-url.ts`); the tree index and the go-to-file match are pure (`lib/repo-tree.ts`,
  `lib/path-filter.ts`).
- Live progress on board cards: agent output stays off the shared event stream, so a running card
  (`card-progress.tsx`) reads `GET /api/projects/:projectId/run-progress` (`routes/run-progress.ts`, core
  `run-progress.ts`): each running run's start and the latest assistant line of `agent_log`, summarized by
  `@union/core/agent-activity` (the same summary the Log uses, in `lib/agent-events.ts`). Every running card shares
  one query (`lib/use-run-progress.ts`, every 3 s, not while the tab is hidden), keyed under `tickets` so a
  `run_started` or `run_finished` event refreshes it at once.
- Keyboard shortcuts: one keydown listener per part through `useShortcuts` (`client/lib/shortcuts.ts`): no key
  counts when typed in a field, with Ctrl, ⌘ or Alt, held down, already handled (`defaultPrevented`), or while a
  `<dialog>` without `data-shortcuts` is open (the ticket panel has it, since it answers its own keys). The board
  (`lib/use-board-keys.ts`, only while no ticket is open), the ticket panel (`components/ticket-panel-keys.ts`, not on
  its review page), the review's file list (`review/use-file-keys.ts`) and `?` / `c` (`shortcuts-help.tsx`,
  mounted by `main-area.tsx`) each own their keys; keep the list in `shortcuts-help.tsx` and the user guide in step.
  "Next needing you" walks the board's own `tickets` query in column order (`lib/next-needing.ts`, with `needsYou`
  from `board-filter.ts`).
- Agent review comments: "Review with agent" on either review page queues an `agent_reviews` row
  (`routes/agent-review.ts`, `@union/core` `agent-reviews.ts`). Its findings become drafts with `author: 'agent'`
  (badge "suggested", Keep button); keeping or editing one makes it the user's (`author: 'user'`), and a new
  successful run replaces only the agent's untouched drafts. Nothing is sent: the drafts go out with the usual
  send. Its prompt and model are the `review_comments` agent in Union settings; `final_review` is unrelated.
  The button's dialog (`agent-review-dialog.tsx`) lists the review's specs (`spec-summary.tsx`) and starts; none
  means the agent reviews the code alone, and a request with no `specs` keeps the old prompt. In a stack
  (`lib/review-stack.ts`, provided by `stack-review.tsx`) it reviews the whole stack by default, with every member's
  specs (`useStackSpecs`, `stackSpecs` in `@union/core/review-spec-lists`). `routes/pr-agent-review.ts` checks the PRs are under review and in one GitHub stack (read then, bottom first in its order), reads
  every member's files again (`readReviewFiles`), refuses (409) members merged or closed on GitHub by number, and
  queues one run with its members
  (`agent_review_members`); every PR's tab shows that run (`latestAgentReview` counts the stacks a review is in).
- A review's specs: `review_specs` rows (`@union/core` `schema-review-specs.ts`, `review-specs.ts`; pure parts in
  the browser-safe `review-spec-lists.ts`), owned by a ticket or a current review. `routes/review-specs.ts`
  (mounted from `grouping-targets.ts` on the same `GroupingTarget`) answers `GET /specs` (the starting specs added
  once, `GroupingTarget.starts`; each read through `readSpec` unless edited, its label and URL kept as read, or the
  error) and `PUT /specs` (the whole list; a Notion spec's ref becomes the page id). The client: the bar
  `specs-bar.tsx` under the header (`review-top.tsx`), the dialog `specs-dialog.tsx` and `spec-row.tsx`, its open
  state in `specs-editing.tsx` (the agent dialogs' "Edit the specs"), `lib/use-review-specs.ts`.
- A review's Notion pages: its `notion` specs. `routes/review-notion.ts` (mounted from `review-workspace.ts`) reads
  each linked page's text and its open discussions (`GET`, one page at a time; `discussionsOfPage` in
  `notion-discussions.ts` reuses the markdown already read, and a refused comment read becomes the page's
  `discussions.error`, so the text still shows), checks a page before linking (`POST /check`), links one more (`PUT`) and unlinks
  one (`DELETE /:pageId`); `{ page, stack: true }` also links the reviews of its GitHub stack without a page
  (`github_stack_number`). The reviews list carries `notionPages` (`current-review-list.ts`). `GET
  /notion/suggestions` (`review-notion-suggestions.ts`) reads the description's Notion links (`notionUrlsIn`,
  `@union/core` `notion-links.ts`) and returns the readable ones not linked yet. The client's row is `review-notion-link.tsx` (suggestions and the stack button in `review-notion-offers.tsx`) in the
  Description tab (`review-description.tsx`), the tab `review-notion-tab.tsx`, both through
  `lib/use-review-notion.ts`; `prReviewSections` adds the tab when the review has pages.
- Grouping by spec: the file panel's "By spec" switch (`group-by-spec-button.tsx`) opens `group-by-spec-dialog.tsx`,
  which sends the review's specs as one text (`groupingText`; sources read by `routes/spec-sources.ts`: the PR
  description without Union's links, the ticket's text, a GitHub issue, any Notion page the integration can read)
  and queues a `review_groupings` row
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
- Review agents: `routes/review-agent-runs.ts`, mounted as `/review-agents` beside the reports
  (`grouping-targets.ts`, same `GroupingTarget` and refusal): `GET` the ready review agents, the newest run per
  agent on the change (specs by name, `outdated`) and the refusal; `POST { agentId }` queues a `review_agent_runs`
  row with the review's readable specs (`readableSpecs`, shared with the report, none needed; 409 when busy, 400
  for an agent that is not a ready review agent); `POST /:runId/cancel` queues `cancel_review_agent_run`. The
  client: the **Agents** tab after Report (`review/review-agents-tab.tsx`, `review-agent-run-card.tsx`,
  `lib/use-review-agents.ts`, polled while a run works), its answer in `Markdown` with `renderCode`
  (`review/diff-link-code.tsx`: a changed file's reference opens the Diff tab through `useOpenLines`).
- Spec report: `routes/review-reports.ts` (mounted beside the groupings from `grouping-targets.ts`, on the same
  `GroupingTarget` and its refusal): `GET /reports` the newest report (the specs it read by name, the result, the
  agent's `raw` text of a failed run, `outdated` once the review's head moved), `POST /reports` reads the review's
  specs as the Specs bar shows them (`readReviewSpecs`: removed and unreadable ones left out, numbered for the
  agent; refused without one, over `MAX_SPECS` or over `MAX_SPEC_CHARS`) and queues a `review_reports` row
  (`@union/core` `review-reports.ts`), `POST /reports/cancel` queues `cancel_review_report`, `POST /reports/gaps` adds a general draft from the
  stored report (`reportGaps`, `addGeneralDraft` in `review-output-comment.ts`; refused when outdated or with no
  gap). The worker's
  `ReviewReportRunner` writes it (`docs/architecture/worker.md`). The client: the **Report** tab, added by
  `ticket-review.tsx` and `prReviewSections`; a section's `content` may be a function of `{ openDiff }`
  (`review-page.tsx`) so its links can switch to the Diff tab. `report-tab.tsx` (writing, failed, empty or the
  report), `report-start.tsx` (the specs through `SpecSummary`, Start), `report-body.tsx`, `report-important-files.tsx`,
  `report-header.tsx` (verdict, counts, Add the gaps, Copy as markdown, Run again), `report-requirement.tsx`,
  `report-sections.tsx`; `report-open.tsx` opens a file at lines (or a draft comment on
  them) through the Explain focus (`explain.show`), `report-marks.tsx` gives the file rows the current report's
  important files (the **Key** badge in `file-row.tsx`, provided by `file-list.tsx`). `lib/use-review-report.ts`
  polls while a report is queued or running; labels and Copy as markdown come from the browser-safe
  `@union/core/review-report-markdown`.
- Explain: `routes/review-explanations.ts` (mounted beside the groupings from `grouping-targets.ts`, on the same
  `GroupingTarget` and its refusal) lists a review's explanations with their spec parts and `outdated`, queues one
  (`explanation-request.ts`: lines checked against the file's patch, excerpt from `diffExcerpt`, specs through
  `parseAgentReviewSpecs`; a follow-up copies its parent's lines and specs), cancels one through a command, and
  serves its agent lines (`/log`). The client: `explain-context.tsx` (provided by `ReviewPage`: the panel's open
  state, the review's specs, asking, and the lines to show), the panel
  `explain-panel.tsx` beside the diff in `diff-area.tsx`, `explanation-card.tsx` (a thread),
  `explanation-answer.tsx`, `explanation-progress.tsx`, `lib/use-explanations.ts` (polled while one is active).
  Opening an explanation's lines picks the file in `diff-body.tsx` and selects them in `open-file.tsx` until the
  user picks or selects another; Copy as comment starts the comment editor with the answer quoted.
- Previews: project settings → Preview (`routes/preview-settings.ts`, `config.preview`: compose file, service,
  port, plain variables) and the ticket Overview's Preview section (`preview-section.tsx`, `routes/preview.ts`,
  state in the `previews` table). Start, stop, reset and logs are commands; the worker owns Docker. What a ticket's and a
  pull request's preview routes share (the view, the refusals, a pending command, queueing one, the user's compose
  file) is `routes/preview-subject.ts`. Its `e2eStale` says when the last e2e result predates the preview's last
  start or the ticket's last agent run (`e2eStaleness` in core): the client then hides "Send the failure to the
  agent", and a review refuses adding the result. A pull request under review's own preview and commands live under
  `…/reviews/:number/preview` and `…/runs` (`routes/review-preview.ts`, `routes/review-runs.ts`): its commands carry
  `{ reviewId }` in their payload (`ticket_id` null), plus `update` (`review_checkout_update`), the e2e screenshots,
  and "Add to review" (`POST …/e2e/review`, `…/runs/:id/review`), which writes the output as a general draft comment
  (`review-output-comment.ts`). Removing a review or a stack (`routes/review-removal.ts`) drops its pending
  commands, queues `remove_containers` for `union-r<id>` and deletes its files (`attachments/r<id>/`).
  In the client, the ticket's Preview tab and a review's (`pull-requests/review-preview-tab.tsx`, the review
  page's last section) share `preview-section.tsx`, `preview-e2e.tsx`, `preview-compose-dialog.tsx` and
  `container-commands.tsx`, given a `PreviewTarget` (`lib/preview-target.ts`: the same targets as a review page's,
  its paths and query keys). A ticket's keeps its event-driven refresh and its "send to the agent" actions
  (`ticket-e2e-actions.tsx`, `ticket-run-actions.tsx`); a review's polls while a command is pending or a change is
  on its way (`previewPoll`), says whose code runs and whether it gets the secrets, offers the update to the
  reviewed commit, and "Add to review" (`pull-requests/review-e2e-actions.tsx`, `review-run-actions.tsx`). Under
  review shows "preview running" on a review or a stack (`previewStatus` in the list).
- Running previews: a global page (sidebar → Previews, `previews/running-previews-page.tsx`) lists every project's
  previews that hold containers (starting, running, stopping), tickets' and pull requests' alike, from
  `GET /api/previews` (`routes/running-previews.ts`, polled every 5 s); the sidebar entry shows their count. Stop
  queues `preview_stop` for the preview's owner (`POST /api/previews/:id/stop`); a ticket's row opens the ticket.
- PR description rewrite: the PR tab's Description section (`pull-request/pr-description.tsx`,
  `routes/pr-description.ts`, `@union/core` `pr-descriptions.ts`) queues a `pr_descriptions` row, one per open
  slice's pull request on a split ticket (one button rewrites them all; `?pr=` picks the draft shown, the same
  section for every pull request: GitHub's text, else the draft). The agent's draft
  is the user's to edit, send or discard; sending is the `update_pr_description` command. "Outdated" means a
  `branch_pushed` event came after the last `pull_request_opened` or `pr_description_sent`. Union's links ("Closes
  #n", the PR it builds on, a stack's list) are never part of the draft: `withoutUnionLinks` strips them,
  `pullRequestBody` (with the stack, for a split ticket) adds them back.
- Union's update: the sidebar's Update entry (`components/union-update/`, `lib/use-union-update.ts`, polled
  every 5 s) reads `routes/union-update.ts` (the worker's last check and the work in progress, from core
  `activeWork`) and queues `union_update_check` or `union_update`. `src/restart-watch.ts` (under compose only,
  `UNION_SUPERVISED`) ends the web's container on `union_restart`. The page reloads itself once the status is
  `idle` on a new commit.
- `client/` is the SPA: Tailwind v4, TanStack Query, dnd-kit. `app.tsx` is the shell, `components/` the UI,
  `lib/` the hooks and the typed `api.ts`. The browser keeps one event stream for all its Union tabs
  (`lib/event-hub.ts`: the tab holding the Web Lock `union-events` reads `/api/events` and relays each event
  over a BroadcastChannel; browsers allow six connections per host, and a stream per tab or log used to leave
  clicks waiting). The board and ticket panel refetch on its events (`use-live-invalidation.ts`); the Log tabs
  poll `/api/events/log` every second while open (`use-log.ts`): the ticket's or investigation's events and its
  agents' output (`agent_log`) in one order, from a cursor. Agent output is not on the stream. Events are sent unnamed: a new event type reaches
  the client without being listed. A call's `result` line shows its tokens, and each run's header their sum
  (`token-counts.ts`, reading the result with the browser-safe `@union/core/agent-usage`). The Overview's run table
  and an investigation's Usage tab read `agent_usage` (`GET /api/tickets/:id/usage`,
  `…/investigations/:id/usage`, `usageOf` in core): input, output and API-equivalent cost per run (or per call), a
  row opening to its calls and models with their peak context (`components/usage/`).
- Dev: `bun run dev:web` (Vite on 5173 proxies `/api` to Hono on 3000). Production: build, then start (below).
