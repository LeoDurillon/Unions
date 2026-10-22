# Reply to pull request comments

Status: planned (2026-10-22). Decisions D1 to D7 proposed, to confirm.

## Why

The review page of a pull request under review (its **Comments** tab) and a ticket's **PR** tab (the discussion)
show what was said on GitHub: review summaries, conversation comments and line threads. They are read only: to
answer a reviewer ("done in 3f2a1c", "no, because…") the user opens GitHub. They should be able to reply where they
read it.

## Design in short

- **Line threads** (`ThreadCard`): a **Reply** button under the last comment opens a box (markdown, **Send**,
  **Cancel**, and **Resolve the thread**, unticked by default). Sending posts one reply in that thread on GitHub.
- **Conversation comments and review summaries** (`NoteCard`): GitHub has no threads for them; **Quote reply**
  opens the same box with the comment quoted (`> ` lines, as GitHub's Quote reply does, the author named), and
  Send posts a new conversation comment on the pull request.
- While the worker posts, the reply shows under its thread or note as "Sending…" (it survives a reload); once
  posted, the discussion is read from GitHub again and the reply appears as GitHub has it. A failure shows
  GitHub's reason in the box, the text kept, to send again.
- Same component in both places: the review page's Comments tab (one pull request, or the picked one of a stack)
  and the ticket's PR tab. Nothing goes to the implementer: replying is not **Add to review**.

## Decisions (proposed)

- **D1. Sent at once, not with the review.** A reply is posted on its own, like GitHub's "Add single comment",
  not held as a draft until **Send review**. Replies answer people now; the review is about the code. Holding
  replies in the pending review (GraphQL `addPullRequestReviewThreadReply` takes a `pullRequestReviewId`) is left
  for later, if wanted.
- **D2. A worker command.** Replying is a GitHub write: the web queues `reply_pr_comment`, the worker posts (the
  web never writes to GitHub). Payload: `{ projectId, number, target, body, resolve }`, where `target` is
  `{ kind: 'thread', threadId }` (the thread's GraphQL node id) or `{ kind: 'note', url }` (the quoted comment,
  for the pending reply's place). The command row holds the text until it is handled: it is the pending reply.
  No new table; GitHub is the record.
- **D3. Who posts.** The project's credentials, as for reviews: the GitHub App's bot (`<app>[bot]`) or the token's
  user. The box says which under Send ("Posts as @union-app[bot]") from what the project's auth is, no GitHub
  call; for a token, "Posts with the project's token".
- **D4. The worker checks the target.** The web does not read GitHub to queue a reply. The worker reads the
  thread node first (`node(id) { ... on PullRequestReviewThread { pullRequest { number repository { nameWithOwner } } } }`)
  and refuses one that is not on the project's repository and that pull request. A deleted thread fails with
  "The thread is gone on GitHub".
- **D5. Events.** `pr_comment_replied: { number, url, reviewId: number | null }` and
  `pr_comment_reply_failed: { number, error, body, reviewId: number | null }`, on the ticket whose pull request it
  is if there is one (as `pr_review_posted`). The client refetches the discussion on either for the same pull
  request. No notification for a failure (the user is on the page) and no rule trigger in v1.
- **D6. Limits.** The body is trimmed, refused empty or over `MAX_REPLY_LENGTH` (GitHub's 65,536 characters) by the
  web route. A quoted note is cut to its first `MAX_QUOTE_LINES` lines (named constant, 12), with `…` when cut.
- **D7. Not in the diff yet.** GitHub's threads are not drawn on the diff today (only Union's drafts are), so
  replying lives in the Comments and PR tabs. Showing GitHub threads under their lines, with Reply, is a later
  step.

## GitHub API (check each point before building)

- Thread reply: GraphQL `addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId, body })` returns the
  new comment's `url`. Works on resolved and outdated threads.
- Resolve: `resolveReviewThread(input: { threadId })`, only when **Resolve the thread** is ticked; a refusal there
  does not fail the posted reply (the event says "posted, not resolved: <reason>").
- Conversation comment: `POST /repos/{o}/{r}/issues/{n}/comments` (`GitHubApi.createComment` already exists).
- Permissions: the App's **Pull requests: write** (already needed to post reviews) covers both; check whether the
  issue-comments endpoint on a pull request also wants **Issues: write**, and name the missing one on a 403, as
  `github/ci-rerun.ts` does.
- The thread's node `id` is read today by nobody: add `id` to the `reviewThreads` nodes of `PULL_REQUEST_THREADS`.

## Core (`packages/core`)

- `pr-comment-reply.ts` (new, pure, browser-safe): the payload type and its guard (`replyOf(payload)`), and
  `quoteReply(note: { author, body }, reply)` (the quote, cut per D6, then the reply). Tests next to it.
- `event-payloads.ts` (191 lines): the two events of D5.
- The command type `reply_pr_comment` where command types are declared.

## Web (`apps/web`)

- `github-queries.ts`, `github-discussion.ts`: thread `id`; `PullRequestThread.id` in `api-types.ts`.
- `routes/pr-comment-replies.ts` (new): `POST` checks the body (D6), that the review or ticket has that pull
  request, and inserts the command (202); `pendingReplies(db, projectId, number)` lists the unhandled
  `reply_pr_comment` commands for it. Mounted under a review (`<review>/replies`, beside the routes of
  `review-workspace.ts`) and under a ticket (`/api/tickets/:id/pr-replies`, the ticket's `prNumber`).
- The two discussion responses (review and ticket) gain `pending: PendingReply[]`.
- Tests: the route refuses an empty or too long body, a ticket without a pull request; the command's payload.

## Client (`apps/web/client`)

- `components/pull-request/reply-box.tsx` (new): the textarea, Send, Cancel, the resolve box (threads only), who
  posts, the error, the kept text.
- `note-card.tsx` (154 lines): `ThreadCard` and `NoteCard` take an optional `reply` (the target's mutation and its
  pending reply); without it they stay read only. The pending reply renders as a dimmed comment, "Sending…". If the
  file passes 300 lines, `ThreadCard` moves to `thread-card.tsx`.
- `lib/use-pr-replies.ts` (new): the mutation per target, and `useEvents` on `pr_comment_replied` /
  `_failed` for that pull request to refetch the discussion (as `use-ci-rerun.ts`).
- `pr-review-sections.tsx` and `discussion.tsx` pass `reply`.

## Worker (`apps/worker`)

- `github/api.ts` (165 lines): `threadPullRequest(threadId)`, `replyToThread(threadId, body)`,
  `resolveThread(threadId)`.
- `github/pr-comment-reply.ts` (new): loads the project, checks the target (D4), posts, resolves if asked, emits
  the event; 403 names the permission.
- `commands.ts` (278 lines): one `case 'reply_pr_comment'` calling a hook, the payload check in core.
- Tests with the fake `GitHubApi`: a thread reply, a note reply with its quote, a thread of another pull request
  refused, a failed resolve that still reports the reply.

## Steps

1. Read side: the thread id in the query and types, `toThread` test.
2. Core: payload, quote, events, with tests.
3. Worker: API methods, the handler, the command; tests.
4. Web: the route, pending replies in both discussion responses; tests.
5. Client: the reply box in both tabs, refetch on the events; checked with `scripts/ui-check/` (writes blocked).
6. A real reply on a test pull request the user picks (a GitHub write: ask first).
7. Later, if wanted: GitHub threads drawn on the diff with Reply (D7), replies held in the pending review (D1),
   **Draft a reply** by an agent from the thread and the change.

## Docs to update when built

- `docs/spec/pull-requests.md`: the Comments tab and the PR tab are no longer read only.
- `docs/architecture/integrations.md`: the new writes and the permission; `web.md`, `worker.md`: the route, the
  command.
