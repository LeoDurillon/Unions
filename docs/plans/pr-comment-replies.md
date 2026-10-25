# Reply to pull request comments

Status: planned (2026-10-22), revised (2026-10-25): suggested replies from the implementer added, stored on
`review_comments`; built together with the manual replies. Decisions D1 to D10 to confirm. Steps 1 and 2
built (branch `pr-comment-replies`).

## Why

The review page of a pull request under review (its **Comments** tab) and a ticket's **PR** tab (the discussion)
show what was said on GitHub: review summaries, conversation comments and line threads. They are read only: to
answer a reviewer ("done in 3f2a1c", "no, because…") the user opens GitHub. They should be able to reply where they
read it, and, when the implementer just worked on those comments, find the answer already written.

## Design in short

- **Line threads** (`ThreadCard`): a **Reply** button under the last comment opens a box (markdown, **Send**,
  **Cancel**, and **Resolve the thread**, unticked by default). Sending posts one reply in that thread on GitHub.
- **Conversation comments and review summaries** (`NoteCard`): GitHub has no threads for them; **Quote reply**
  opens the same box with the comment quoted (`> ` lines, as GitHub's Quote reply does, the author named), and
  Send posts a new conversation comment on the pull request.
- **Suggested replies.** When a ticket's revision worked on comments imported from GitHub (**Import**, **Add to
  review**), the implementer, after the push, writes one reply per comment in its own session: what it changed and
  in which commit, or why it did not. Each one is a draft on the imported comment's row, shown under its thread or
  note as **Suggested reply** with **Edit**, **Send** and **Discard**, and **Send all replies** at the top of the
  tab. Nothing reaches GitHub until the user sends it.
- While the worker posts, the reply shows under its thread or note as "Sending…" (it survives a reload); once
  posted, the discussion is read from GitHub again and the reply appears as GitHub has it. A failure shows
  GitHub's reason in the box, the text kept, to send again.
- Same component in both places: the review page's Comments tab (one pull request, or the picked one of a stack)
  and the ticket's PR tab. Nothing goes to the implementer: replying is not **Add to review**.

## Decisions (proposed)

- **D1. Sent at once, not with the review.** A reply is posted on its own, like GitHub's "Add single comment",
  not held in GitHub's pending review until **Send review**. Replies answer people now; the review is about the
  code. Suggested replies are drafts in Union, not in GitHub's pending review.
- **D2. A worker command.** Replying is a GitHub write: the web queues `reply_pr_comment`, the worker posts (the
  web never writes to GitHub). Payload: `{ projectId, number, target, body, resolve, reviewId, ticketId }`, where
  `target` is `{ kind: 'thread', threadId }` (the thread's GraphQL node id), `{ kind: 'note', url }` (the quoted
  comment, for the pending reply's place) or `{ kind: 'comment', commentId }` (a `review_comments` row with a
  suggested reply). `body` is the final text: a quote is built before, in the box or when the suggestion is
  written, never by the worker. A suggestion's state is on its row (D8). A manual reply is pending while its
  command has no `pr_comment_replied` or `_failed` event (`commandId`): `drainCommands` marks a command handled
  as soon as it hands it to the worker's hook, before GitHub answers. One older than `STALE_REPLY_MS` (10
  minutes) is no longer shown pending, for a worker stopped mid-post.
- **D3. Who posts.** The project's credentials, as for reviews: the GitHub App's bot (`<slug>[bot]`, the slug is
  stored with the App) or the token's user. The box says which under Send ("Posts as @union-app[bot]") from the
  project's auth, no GitHub call; for a token, "Posts with the project's token".
- **D4. The worker checks the target.** The web does not read GitHub to queue a reply. For a thread, the worker
  reads the thread node first (`node(id) { ... on PullRequestReviewThread { pullRequest { number repository { nameWithOwner } } } }`)
  and refuses one that is not on the project's repository and that pull request; a deleted thread fails with
  "The thread is gone on GitHub". For a suggestion on a line comment, the worker finds the thread among the pull
  request's threads by its first comment's URL (the row's `github_url`), which is the same check; none found is
  "The thread is gone on GitHub". A note needs no check: it posts on `issues/{number}/comments` of the project's
  repository, the URL only places the pending reply.
- **D5. Events.** `pr_comment_replied: { commandId, number, reviewId, commentId, url, resolveError }` and
  `pr_comment_reply_failed: { commandId, number, reviewId, commentId, error, body }` (`reviewId` and `commentId`
  null when none), on the ticket whose pull request it is if there is one (as `pr_review_posted`), and
  `pr_replies_suggested: { number, count }` when the implementer wrote suggestions. The client refetches the
  discussion on any of them for the same pull request. No notification for a failure (the user is on the page) and
  no rule trigger in v1.
- **D6. Limits.** The body is trimmed, refused empty or over `MAX_REPLY_LENGTH` (GitHub's 65,536 characters) by the
  web route. A quoted note is cut to its first `MAX_QUOTE_LINES` lines (named constant, 12), with `…` when cut.
- **D7. Not in the diff yet.** GitHub's threads are not drawn on the diff today (only Union's drafts are), so
  replying lives in the Comments and PR tabs. Showing GitHub threads under their lines, with Reply, is a later
  step.
- **D8. Suggestions live on `review_comments`.** An imported comment is already a row (`github_url` set), so its
  reply goes on that row, no new table: `reply_body` (text, null), `reply_author` (`agent | user`, `user` once
  edited, as `author`), `reply_resolve` (boolean: the agent's "fixed" ticks it, the user can untick),
  `reply_status` (`draft | sending | sent | discarded`, null when none was written) and `reply_error` (GitHub's
  reason of the last failure, null otherwise). `reply_status` is `requested | draft | sending | sent |
  discarded`: **Send review** sets `requested` on the imported comments it sends when the project's setting is on
  (D10), the implementer's turn turns them into `draft` (or back to null when it wrote none). Discard sets
  `discarded`, so a later revision does not write it again. The Comments and PR tabs match rows to threads and notes by `github_url` (a thread's first comment).
- **D9. When the implementer writes them.** Only after a revision from **Send review** whose sent comments
  include imported ones, and only once the branch is pushed (so "fixed in abc123" names a commit the reviewer
  sees; a stack's revision, after `pushRevision`). One turn in the implementer's session, like the pull request
  description (`askDescription`): reading only, its answer in a fenced `json` block, as the agent review's
  findings, one entry per comment id (`{ id, body, resolve }`); ids it was not given are dropped. The comments are
  the ticket's rows in `requested`: the state machine's `revise` carries no feedback (it is stored on the step
  output), so nothing new goes through `states.ts`. A failed or empty turn logs
  `union_pr_replies_failed` and never fails the step. Comments written in Union get no reply. A slice's comment
  replies on its slice's pull request (`slice_position`), else the ticket's.
- **D10. A setting and an agent role.** `pr_replies` is an agent role in `agents.ts` (prompt, model, effort, tools,
  editable on its Agent settings page like `pr_description`), and the project setting **Suggest replies to GitHub
  comments** (`suggestReplies`, on by default) turns the turn off: it costs one turn per revision that had GitHub
  comments. Send review reads it, so a revision sent with it off asks for none.

## GitHub API (check each point before building)

- Thread reply: GraphQL `addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId, body })` returns the
  new comment's `url`. Works on resolved and outdated threads.
- Resolve: `resolveReviewThread(input: { threadId })`, only when **Resolve the thread** is ticked; a refusal there
  does not fail the posted reply (the event says "posted, not resolved: <reason>").
- Conversation comment: `POST /repos/{o}/{r}/issues/{n}/comments` (`GitHubApi.createComment` already exists).
- Permissions: the App's **Pull requests: write** (already needed to post reviews) covers both; check whether the
  issue-comments endpoint on a pull request also wants **Issues: write**, and name the missing one on a 403, as
  `github/ci-rerun.ts` does. A token's user needs write access to resolve a thread.
- The thread's node `id` is read today by nobody: add `id` to the `reviewThreads` nodes of `PULL_REQUEST_THREADS`.

## Core (`packages/core`)

- `pr-comment-reply.ts` (built, browser-safe, `@union/core/pr-comment-reply`): the payload type and its guard
  (`replyOf(payload)`, which throws as `ciJobOf` does), `replyBodyProblem(body)` (D6), and
  `quoteReply(note: { author, body }, reply)` (the author named, the quote cut per D6, then the reply). Tested.
- `schema-reviews.ts`: the columns of D8 (built, migration `0074_pr_comment_replies`).
- `event-payloads.ts`: the three events of D5 (built).
- `schema-types.ts`: `ProjectConfig.suggestReplies` (built).
- `agents.ts` (316 lines): the `pr_replies` role (D10), in step 4. Already over the limit: put its prompt in its
  own file first if adding it breaks the lint.
- Command types are plain strings, handled in the worker's `commands.ts`: nothing to declare in core.

## Web (`apps/web`)

- `github-queries.ts`, `github-discussion.ts`: thread `id`; `PullRequestThread.id` in `api-types.ts`.
- `routes/review.ts`: `sendReview` sets `reply_status = 'requested'` on the drafts it sends that have a
  `github_url`, in its transaction, when `suggestReplies` is not false.
- `routes/pr-comment-replies.ts` (new): `POST` checks the body (D6), that the review or ticket has that pull
  request, and inserts the command (202); `pendingReplies(db, projectId, number)` lists the unhandled
  `reply_pr_comment` commands for it. Mounted under a review (`<review>/replies`, beside the routes of
  `review-workspace.ts`) and under a ticket (`/api/tickets/:id/pr-replies`, the ticket's `prNumber`).
- `routes/pr-reply-suggestions.ts` (new): under a ticket, `PATCH` a suggestion (body, resolve; `reply_author`
  becomes `user`), `POST .../send` (one, or all drafts of the pull request: `reply_status` to `sending` and one
  command each, in a transaction), `POST .../discard`.
- The two discussion responses (review and ticket) gain `pending: PendingReply[]` and, the ticket's,
  `suggested: SuggestedReply[]` (row id, `github_url`, body, resolve, status, error).
- Tests: the route refuses an empty or too long body, a ticket without a pull request; the command's payload;
  sending all suggestions queues one command per draft; a discarded one is not sent.

## Client (`apps/web/client`)

- `components/pull-request/reply-box.tsx` (new): the textarea, Send, Cancel, the resolve box (threads only), who
  posts, the error, the kept text. A suggestion opens it filled, with Discard.
- `note-card.tsx` (155 lines): `ThreadCard` and `NoteCard` take an optional `reply` (the target's mutation, its
  pending reply and its suggestion); without it they stay read only. The pending reply renders as a dimmed
  comment, "Sending…"; a suggestion as "Suggested reply" with Edit, Send, Discard. If the file passes 300 lines,
  `ThreadCard` moves to `thread-card.tsx`.
- `lib/use-pr-replies.ts` (new): the mutations per target and for suggestions, and `useEvents` on the D5 events
  for that pull request to refetch the discussion (as `use-ci-rerun.ts`).
- `pr-review-sections.tsx` and `discussion.tsx` pass `reply`; the ticket's PR tab shows **Send all replies (n)**
  when it has drafts.
- The project setting of D10 in the project settings page; the `pr_replies` agent on its Agent settings page.

## Worker (`apps/worker`)

- `github/api.ts` (169 lines): `threadPullRequest(threadId)`, `replyToThread(threadId, body)`,
  `resolveThread(threadId)`, and the thread of a comment URL on a pull request (D4).
- `github/pr-comment-reply.ts` (new): loads the project, checks the target (D4), posts, resolves if asked, sets
  the row's `reply_status` (`sent`, or back to `draft` with `reply_error`) for a suggestion, emits the event; 403
  names the permission.
- `pr-reply-format.ts` (new, pure, as `agent-review-findings.ts`): the answer's format, its parser (unknown ids,
  empty and too long bodies dropped, `resolve` only on line comments) and the list of comments in the prompt.
- `pr-reply-suggestions.ts` (new): after the push in `implement.ts` (`publishAndReport`, both the branch and the
  stack path), when the ticket has rows in `requested`: the prompt, the turn in the implementer's session (as
  `askDescription`), the replies written as drafts (a note's with its quote), the event.
- `commands.ts` (294 lines): one `case 'reply_pr_comment'` calling a hook, the payload check in core; `replyTo`
  read with `feedback` for `revise`. Near the limit: move the revise case's payload reading out first.
- Tests with the fake `GitHubApi`: a thread reply, a note reply, a suggestion on a line comment found by its URL,
  a thread of another pull request refused, a failed resolve that still reports the reply; with a fake agent: the
  suggestions written from the block, unknown ids dropped, a failed turn that leaves the step ok.

## Steps

1. Read side: the thread id in the query and types, `toThread` test.
2. Core: payload, quote, columns and migration, events, the setting, with tests.
3. Worker: API methods, the reply handler, the command; tests.
4. Worker: the answer's format, the suggestions turn after the push, the `pr_replies` role; tests.
5. Web: the reply route, the suggestions routes, pending replies and suggestions in the discussion responses,
   `requested` set by Send review; tests.
6. Client: the reply box and suggestions in both tabs, Send all, the setting, refetch on the events; checked with
   `scripts/ui-check/` (writes blocked).
7. A real reply and a real revision with suggestions on a test pull request the user picks (a GitHub write and
   Claude usage: ask first).
8. Later, if wanted: GitHub threads drawn on the diff with Reply (D7), replies held in GitHub's pending review
   (D1), suggestions for a pull request under review without a ticket (no implementer there today).

## Docs to update when built

- `docs/spec/pull-requests.md` and `docs/spec/flow.md`: the Comments tab and the PR tab are no longer read only;
  the implementer suggests replies after a revision.
- `docs/architecture/integrations.md`: the new writes and the permission; `web.md`, `worker.md`: the routes, the
  command, the suggestions turn; `database.md` if it lists columns.
- `documentation/`: the guide's pages on the PR tab and reviews (replying, suggested replies, the setting).
