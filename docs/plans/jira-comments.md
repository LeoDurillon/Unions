# Jira comments on the ticket

Status: built and deployed (2026-11-07), steps 1 to 5; checked on a real Jira Cloud site (SCRUM-1: comments read, a reply posted with its mention). Follows [Jira](jira.md) (import) and [Jira rule actions](jira-rule-actions.md)
(the worker writes to Jira). Modeled on [Notion comments on the ticket](notion-comments.md), built: read the
issue's comments in a ticket tab, post one from Union, add one to the ticket's review.

## Why

A ticket imported from Jira keeps its discussion in the issue: the product owner's questions, QA's findings, the
answers. Today the ticket panel shows the issue's description as it was imported, but none of its comments: the
user opens Jira to read them and to answer, and copies by hand what the implementer should act on. Notion-imported
tickets already have this in their **Notion** tab; Jira-imported ones should get the same.

## What the user gets

- A **Jira** tab on the ticket panel, in the Notion tab's place (key **5**), for tickets imported from Jira. It
  lists the issue's comments, oldest first: author, time ("edited" when changed), text as markdown (Jira's rich
  text, through the import's converter), and **Open in Jira** on each. **Refresh** reads them again; the tab reads
  them once per opening, as Notion's does.
- **New comment** at the bottom, and **Reply** on each comment: a reply is a new comment that starts with a
  mention of the author, so Jira notifies them (Jira comments have no threads). Sending shows "Sending to Jira…"
  until the worker has posted it, then the list is read again; a refusal opens the box again with the text and the
  reason.
- **Add to review** on each comment, once the ticket has a branch: the comment becomes a general draft of the
  ticket's review, sent to the implementer under "On the spec (Jira comments)", as Notion's discussions are.

## What does not change

- The description stays as imported: comments are read live, the issue's text is not synced.
- Reads from the web, writes from the worker; the token never reaches the browser.
- The review flow: a Jira comment added to the review is a `general` draft like any other.

## Decisions

- **D1. One tracker tab per ticket.** A ticket has one origin, so the fifth tab is the tracker it came from:
  **Notion** or **Jira**, same key. `Section` gains `'jira'`; `ticket-tabs.tsx` and `ticket-panel-keys.ts` pick the
  tab from `originKind` rather than adding a sixth key.
- **D2. Flat comments, replies as mentions.** Jira Cloud's REST API has no comment threads. **Reply** prefills
  nothing visible: it sends the text with a mention node of the author first (`{ type: 'mention', attrs: { id:
  accountId, text: '@Name' } }`), which Jira renders as `@Name` and notifies. `text-adf.ts` gains an optional
  leading mention; the comment's text stays plain (no markdown, as for rule comments).
- **D3. Read with paging, newest pages capped.** `GET /rest/api/3/issue/{key}/comment?orderBy=created&startAt=…`
  (100 a page). An issue with more than 500 comments shows the last 500 and says how many are left out: older ones
  are read in Jira.
- **D4. Restricted comments are shown, marked.** A comment with `visibility` (a role or group) or, in Jira Service
  Management, `jsdPublic: false` (internal) is shown with a badge ("Visible to Developers", "Internal"), since the
  account could read it. A comment posted from Union is always public: Union does not set `visibility`. The tab
  says so under **New comment**.
- **D5. Media in comments by name.** A comment's images and files belong to the issue's attachments; the tab shows
  each by name with **Open in Jira** (no download through the web: it would need the token in the browser, or a
  proxy route for a tab that is read often). Added to the review, a media node becomes its name, as in the import's
  fallback.
- **D6. Commands and events as Notion's.** `post_jira_comment` (`{ projectId, ticketId, key, text, mention:
  { accountId, name } | null }`, checked by core's `jira-comment-post.ts`), handled by the worker's
  `jira/comment-post.ts` with `JiraApi.addComment`; it logs `jira_comment_posted` (`{ commandId, commentId }`) or
  `jira_comment_failed` (`{ commandId, text, error }`, 403 naming "Add comments"), declared in
  `event-payloads.ts`. The tab lists the comments not posted yet from the pending commands, as Notion's does.
- **D7. The review knows Jira comments by their link.** `review_comments.source_url` is the comment's
  `https://<site>/browse/<key>?focusedCommentId=<id>`, so adding it again is refused, and `review-feedback.ts`
  groups drafts whose source is a Jira comment under "On the spec (Jira comments)" (today it tests
  `isNotionUrl`; it gains `isJiraCommentUrl`, browser-safe, in core).

## Design

### Core

- `integrations/jira-comments.ts`: `JiraComment` (`id`, `author`, `accountId`, `created`, `updated`,
  `restriction: string | null`, `markdown`, `url`) and `commentsOf(body, site, key)` (ADF through
  `adfMarkdown`, media by name, D5). `JiraApi.comments(auth, key)` pages (D3) and returns them with `total`.
- `jira-comment-post.ts` (browser-safe): the command's payload, `jiraCommentProblem(text)` (empty, over 32 767
  characters), `jiraCommentOf(payload)`.
- `text-adf.ts`: `textAdf(text, { mention })` (D2).
- `event-payloads.ts`: the two events (D6). `jira-links.ts`: `jiraCommentUrl`, `isJiraCommentUrl` (D7).

### Web server

- `routes/jira-comments.ts`: `GET /api/tickets/:id/jira-comments` (the comments read now, the pending ones, which
  are in the review and whether the review takes more), `POST` (queues `post_jira_comment`), `POST /import`
  (`{ commentId }`, read again, added as a general draft). A ticket not imported from Jira answers 409. Jira's 401,
  403 and 404 become messages, as the import's (`guarded`).
- `jira-comment-commands.ts` (queue, pending), `jira-review-import.ts` (the draft's body: "**Name** commented on
  the Jira issue:" then the markdown; the refusal before a branch exists, as Notion's).
- `review-feedback.ts`: the "On the spec (Jira comments)" group (D7).

### Worker

- `jira/comment-post.ts`: posts the command's comment, logs the event (D6); `commands.ts` gets the handler.

### Client

- `components/jira/`: `jira-tab.tsx` (list, Refresh, New comment), `jira-comment.tsx` (one comment: author, time,
  badge, markdown, Open in Jira, Reply, Add to review), `jira-reply.tsx` (the box, pending and failed states).
  Files under 300 lines, as the Notion tab's were split (`notion-tab.tsx`, `notion-discussion.tsx`,
  `notion-reply.tsx`).
- `ticket-tabs.tsx`, `ticket-panel-keys.ts`: the tracker tab by origin (D1).

## Steps

Each step ships on its own; `bun run check` after each.

1. **Core: reading comments.** `JiraApi.comments` with paging and its fake, `commentsOf`, restriction badges, media
   by name. Tests on comment bodies with paragraphs, mentions, code, media, a restricted and an internal comment,
   paging past 500.
   Built: `integrations/jira-comments.ts` (`commentPageOf`, `JiraComment`: author, `accountId` or null, created,
   updated, `edited`, `restriction`, markdown through `adfMarkdown` with media by name, the comment's link) and
   `JiraApi.comments` (`FetchJiraApi`: `orderBy=-created`, 100 a page, at most 5 pages, then reversed so the tab
   lists oldest first; `total` is the issue's count, so the tab can say how many it leaves out). The test fakes of
   the import gained it. `jiraCommentUrl` stays in the file until step 4's review import needs it.
2. **The tab, read only.** The route's `GET`, the tab, D1's tab choice. Route tests with the fake. UI check
   (`scripts/ui-check/`): the tab on a Jira ticket, Refresh, the Notion tab unchanged on a Notion ticket. Then a
   read-only check on the user's SCRUM-1 (reading only: no need to ask).
   Built: `routes/jira-comments.ts` (`GET`; 409 for a ticket not from Jira or a project not connected, Jira's 401
   and 404 through `guarded`), core's `jiraAuthOf(db, projectId)` for the credentials, `jira-comment-types.ts`
   (`JiraTabView`: key, issue link, comments, total). Client: `components/jira/jira-tab.tsx` (Open in Jira,
   Refresh, the note on comments left out), `jira-comment.tsx` (author, time, "edited", restriction badge,
   markdown, Open in Jira), `lib/use-jira-comments.ts`. D1 is `components/tracker-tab.tsx`: `trackerSection`
   picks the fifth tab (Jira for a Jira ticket, else Notion, disabled without a page), and key 5 opens it
   (`ticket-panel-keys.ts`, a `tracker` key). UI check on the worktree's server with a scratch database, the tabs'
   reads stubbed in the browser: the tabs of a Jira, a Notion and a written ticket, key 5, the tab's note, badge and
   "edited". Deployed (`051f68b`): the live API read SCRUM-1's two comments (one posted by a rule), both with an
   account id to mention.
3. **Posting.** The command, `textAdf`'s mention, the worker's handler, the events, New comment and Reply with
   their pending and failed states. Tests: the payload checks, the ADF with a mention, the worker with the fake (a
   post, a 403, a 429 retried as the command queue does). UI check with the posts blocked. A real post on SCRUM-1
   only after asking the user (it writes to their Jira).
   Built: core's `jira-comment-post.ts` (payload with `replyTo: { commentId, accountId, name } | null`, checks;
   exported as `@union/core/jira-comment-post` for the client), `textAdf(text, mention)`, the two events, and
   `JiraApi.addComment` returning the new comment's id. Worker: `jira/comment-post.ts` (`postJiraComment`, 403
   naming "Add comments", 404 for a moved or deleted issue), behind `tracker-hooks.ts` with Notion's (`hooks.ts`
   was at its import limit), and the `post_jira_comment` command. Web: `jira-comment-commands.ts`, the route's
   `POST`, the tab's `pending`; the pending lookup is shared with Notion's (`pending-comments.ts`, Notion's module
   moved onto it, its tests unchanged). Client: `useJiraCommentSend`, `components/jira/jira-reply.tsx` (says the
   comment starts with the mention and is visible to everyone who can see the issue), Reply in each card and New
   comment at the bottom. A reply to an author without an account goes as a new comment (its pending and failure
   show at the bottom). UI check on a scratch database, the read and the post stubbed: Reply's box and note, the
   body sent, "Sending to Jira…" under the comment, and a `jira_comment_failed` event written to the scratch
   database reopening the box with the text and the reason.
4. **Add to review.** The import route, the draft's body, D7's grouping and duplicate refusal. Tests as Notion's
   (`notion-review-import` tests): before a branch, after merge, twice, the feedback's heading.
   Built: core's `jira-comment-link.ts` (`jiraCommentUrl`, moved from `jira-comments.ts`; `isJiraCommentUrl`;
   `JIRA_COMMENT_URL_LIKE`; exported as `@union/core/jira-comment-link`). Web: `jira-review-import.ts` (the draft
   "**Name** commented on the Jira issue (visible to …):" then the markdown), the route's `POST /import` (read
   again, 404 when gone) and the tab's `review` state; the refusal is shared with Notion's
   (`review-import-refusal.ts`). `review-feedback.ts` adds "On the spec (Jira comments)" after Notion's. Found on
   the way: `markSent` asked a reply for every imported draft not from Notion, so a Jira comment would have been
   asked a GitHub reply; it now leaves out Jira's links too (tested in `pr-comment-replies.test.ts`). Client:
   Notion's Add to review moved to `components/review/add-to-review.tsx`, used by both tabs;
   `useJiraReviewImport`; the review page's comment card reads "on Jira". UI check on a scratch database, the read
   and the import stubbed: the button disabled with its reason before a branch, "In the review" after adding. The
   review page's "on Jira" link was not checked in a browser (it needs a ticket with a diff).
5. **Docs and status.** `documentation/tickets.md` (the Jira tab), `docs/spec/flow.md` (the ticket panel's tabs),
   `docs/architecture/integrations.md` (Jira reads and the comment write), this plan's status and
   `docs/plans/README.md`.
   Done; AGENTS.md's Jira rule also names the tab's reads and writes. The ticket panel's key table says 5 opens
   Notion or Jira.

## Risks

- **Mentions need the author's account id.** Jira gives it with each comment (`author.accountId`); a comment by
  an app or an anonymized user may have none, then Reply posts without a mention.
- **Comments written in Union read as the token's account.** Jira shows them under the user's name (or a bot
  account's, if they connected one); the tab says whose name before the first post.
- **Large issues.** 500 comments is the cap of D3; reading them is up to five requests each time the tab opens.

## Later

- A comment's images inline in the tab (D5), through a proxy route that fetches with the token.
- Editing and deleting a comment posted from Union.
- The Jira comments in the review page's own tab, as Notion's discussions have.
