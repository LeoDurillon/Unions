# Notion comments on the ticket

Status: planned (2026-10-18). Decisions D1 to D6 proposed, to confirm.

## Why

A ticket imported from Notion keeps its spec in the Notion page, and the people who wrote it discuss it there:
page comments ("is the export CSV or XLSX?") and inline comments on a sentence of the spec. Today the ticket panel
shows the page's text but not its comments: the user has to open Notion to read them, and to answer. The ticket
should show the open discussions of its page and let the user reply (or start one) without leaving Union.

## Design in short

- **Read**: a **Notion** section tab on the ticket panel, next to **PR**, shown for tickets with a `notionPageId`
  only. It lists the page's open discussions, oldest first: page comments, then inline ones under the text they
  are anchored to (a quote of the commented span). Each comment shows its author, time and text (Notion's rich
  text as markdown: bold, code, links, mentions). A **Refresh** button reads them again; the tab reads them once
  per opening, like the PR discussion.
- **Reply**: each discussion has a **Reply** box; the bottom of the tab has **New comment** (a page-level
  discussion). Sending queues a command; the worker posts the comment to Notion and logs an event; the tab shows
  "Sending…" until the event arrives, then reads the discussion again.
- **Send to the implementer as a review comment**: each discussion has **Add to review**, like a PR comment's
  (`note-card.tsx`). It becomes a general draft of the ticket's review (Review changes), editable there, and
  leaves for the implementer with the other comments on the next **Send review**. Added ones show "In the review".

Only the ticket's own page. Resolved discussions are not shown (the API does not return them, see below).

## Notion API (check each point against the docs before building)

- `GET /v1/comments?block_id=<id>&page_size=100` (cursor paging) lists the **unresolved** comments of a page
  (`block_id` = the page id) or of one block (inline comments). Resolved threads are never returned.
- A comment has `id`, `discussion_id`, `parent` (`page_id` or `block_id`), `created_by` (a user id only),
  `created_time`, `rich_text`, `attachments`, `display_name`.
- `POST /v1/comments` with `discussion_id` replies in a thread; with `parent: { page_id }` it starts a page-level
  discussion. Starting a new **inline** discussion (on a span of text) is not offered by the API: Union does not
  try.
- The integration needs the **Read comments** and **Insert comments** capabilities (integration settings →
  Capabilities). Without them, reads and writes answer 403: the tab and the failed event say which capability is
  missing, as `routes/pr-checks.ts` does for the GitHub App.
- Authors: `created_by.id` resolved with `users()` (already used by the rule editor's people field; needs "Read user
  information"). An unknown id (a guest, a bot) shows as "Notion user", the integration's own comments as "Union".
- Which blocks to read: the page markdown (`GET /v1/pages/{id}/markdown`, already used at import) marks commented
  spans with `discussion-urls="discussion://<page>/<block>/<discussion>"`. The read takes the **current** markdown
  (not the ticket body, a snapshot of the import), collects the block ids, and lists the comments of the page and
  of each of those blocks. The span's text is the quote shown above the discussion. Notion allows 3 requests a
  second: blocks are read in order, capped (`MAX_COMMENT_BLOCKS`, a named constant), and the tab says when it
  stopped at the cap.

## Decisions (proposed)

- **D1. Where they show.** A **Notion** section tab, enabled only with a `notionPageId` (`sectionsFor` already
  has `enabled`), rather than under the description on Overview: Overview stays short, and the tab mirrors PR
  (discussion, replies, later picks). The Overview's Source row shows "· N open comments" linking to the tab when
  the count is known (only once the tab has been read; no read on Overview).
- **D2. Who the reply is from.** Notion shows comments posted through an internal integration under the
  integration's name. Union posts with `display_name: { type: 'custom', custom: { name: '<GitHub login> via Union' } }`
  if the API version accepts it for internal integrations, else under the integration's name with no prefix.
  No "Posted from Union" footer in the text.
- **D3. Writing is a worker command.** Replies and new comments are Notion writes: the web queues
  `post_notion_comment` (`{ discussionId | null, text }`), the worker posts. Same pattern as `rerun_ci_job`. The
  command row holds the text until the worker posts it, which is what the tab shows as "Sending…" (survives a
  reload). No local table of comments: Notion is the record.
- **D4. Text format.** The reply box takes plain text with markdown links, `**bold**`, `` `code` `` and line
  breaks; a pure converter turns it into Notion rich text (2000 characters per text object: split longer runs).
  Anything else stays literal. Length capped (`MAX_NOTION_COMMENT`, a named constant), refused by the web route
  before queueing.
- **D5. Tickets created from an investigation as a Notion page** (`ticketInNotion`) have a `notionPageId` too:
  they get the tab. Tickets whose project lost its Notion secret show the tab disabled with "Notion is not set up
  for this project".

- **D6. A Notion comment in the review.** Add to review imports the **whole discussion** (first comment and its
  replies, as `review-import.ts` does for a GitHub thread) as one `review_comments` row: `kind: 'general'`, body
  `**<author>** on the Notion page, about "<quote>":` then the comments. Deduped by its Notion link
  (`https://www.notion.so/<page>?d=<discussion>`) in the existing `githubUrl` column, so a re-import skips it; the
  column is renamed `source_url` in a migration (it no longer holds GitHub links only); `comment-card.tsx` then
  labels the link "on Notion" or "on GitHub" from its host, and renders both as markdown. `review-feedback.ts` puts
  these under their own heading, `## On the spec (Notion comments)`, after `## On the pull request`, so the
  implementer knows they are about the spec and not the code. Offered whenever the review can be sent (the
  ticket has a branch to revise); before that, the button is disabled with "Available once the ticket is
  implemented". The discussion is not resolved in Notion and no reply is posted: the user answers when the fix
  is in.

## Core (`packages/core`)

- `notion-api.ts` (221 lines): add `comments(token, blockId): Promise<NotionComment[]>` (all pages of the cursor)
  and `addComment(token, target: { discussionId } | { pageId }, richText, displayName): Promise<NotionComment>`
  to `NotionApi`. Parsing the comment objects goes in a new `notion-comment-parse.ts` so `notion-api.ts` stays under
  300 lines. `NotionComment = { id, discussionId, blockId: string | null, authorId, createdAt, richText }`.
- `notion-comments.ts` (new, pure, browser-safe): `commentedBlocks(markdown)` (block id → quoted span text, from
  `discussion-urls`), `discussionsOf(comments, quotes, users)` (group by `discussion_id`, oldest first, page
  ones first, then inline ones in page order), `richTextMarkdown(richText)` (annotations, links, mentions to
  markdown; reuse `plain` style).
- `notion-rich-text.ts` (new, pure): `toRichText(text)` for D4, with tests (links, bold, code, splitting at 2000).
- `event-payloads.ts`: `notion_comment_posted: { discussionId: string; commentId: string }` and
  `notion_comment_failed: { discussionId: string | null; error: string }`, both on the ticket. Log lines in the
  worker render; `notion_comment_failed` becomes a notification (Notifications plan: failures need you).
- Command type `post_notion_comment` added where command types are declared and validated.

## Web (`apps/web`)

- `routes/notion-comments.ts` (new), mounted under `/api/tickets/:id/notion-comments`:
  - `GET`: refuses tickets without `notionPageId` or a project without a Notion secret; reads the page markdown,
    the comments of the page and the commented blocks, the users; answers `{ discussions, truncated }` with the
    pending replies (queued `post_notion_comment` commands of the ticket) beside them. `NotionError` 403 → the
    capabilities message.
  - `POST`: `{ discussionId?: string, text }`; checks the length and that the ticket has a page; inserts the
    command. Returns 202.
- `api-types.ts`: `NotionDiscussionView`, `NotionCommentView`.
- The fake `NotionApi` in the web tests gets `comments` and `addComment`.

## Client (`apps/web/client`)

- `ticket-tabs.tsx`: `Section` gets `'notion'`; `sectionsFor` adds it, enabled by `ticket.notionPageId`;
  `PanelBody` renders `NotionTab`.
- `components/notion/notion-tab.tsx`: Refresh, the discussions, New comment, the truncated note, errors.
- `components/notion/notion-discussion.tsx`: the quote (inline ones), the comments (reuse `comment-body.tsx` for the
  folded markdown), the reply box, the pending reply.
- `lib/use-notion-comments.ts`: the query, the mutation, and `useEvents` on `notion_comment_posted` / `_failed`
  for this ticket to refetch (as `use-ci-rerun.ts`).

## Worker (`apps/worker`)

- `notion/post-comment.ts` (new): reads the ticket and project, resolves the display name (D2), converts the text
  (D4), calls `addComment`, emits `notion_comment_posted` or `notion_comment_failed` (403 → the capability name;
  404 → "the discussion was resolved or deleted").
- `commands.ts` (354 lines): one `case 'post_notion_comment'` calling a hook; the payload check in the new file.
- No retry loop: a failed post is shown and the user sends again (the text is kept in the failed event and put
  back in the box).

## Steps

1. Core reads: `comments`, the parsing, `notion-comments.ts` with tests (fixtures from a real page, ids
   replaced).
2. Web `GET` route and the read-only Notion tab; check it against a real Notion ticket (read only).
3. Replies: `toRichText`, the command, the worker handler, events, the reply box and New comment. Check on a
   **test page** of the data source the user picks (posting on a real ticket's page is a write the user approves
   first).
4. Add to review (D6): the `source_url` rename, `importNotionDiscussion` beside `importNote` in
   `apps/web/src/review-import.ts` (or a new `notion-review-import.ts` if it passes 300 lines),
   `POST /api/tickets/:id/notion-comments/import` (`{ discussionId }`, reads the discussion fresh from Notion),
   the heading in `review-feedback.ts` with a test, the button and "In the review" state in the tab (the `GET`
   answers the imported discussion ids, as `importedUrls` does). Later, if wanted: the same text as a planning
   step's "Request changes".
5. Optional: a `notion_comment_added` trigger for rules and notifications, from a poll in the worker (Notion has no
   webhook for internal integrations without a public URL). Only if step 4 shows it is wanted.

## Docs to update when built

- `docs/architecture/integrations.md`: the comment read (web) and write (worker), the two capabilities.
- `docs/architecture/web.md`, `worker.md`: the route, the command.
- Onboarding Notion step and Notion settings: say the integration needs Read and Insert comments.
