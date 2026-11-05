# Notion comments on the ticket

Status: planned (2026-10-18, updated 2026-11-05 against `main`). Decisions D1 to D6 confirmed (2026-11-05). Steps 1
and 2 built and deployed (checked read only against a real ticket's page); step 3, replies, deployed; step 4, Add to review, deployed; step 5, the review's tab, built (branch `notion-comments`).

## Why

A ticket imported from Notion keeps its spec in the Notion page, and the people who wrote it discuss it there:
page comments ("is the export CSV or XLSX?") and inline comments on a sentence of the spec. Today the ticket panel
shows the page's text but not its comments: the user has to open Notion to read them, and to answer. The ticket
should show the open discussions of its page and let the user reply (or start one) without leaving Union.

## Design in short

- **Read**: a **Notion** section tab on the ticket panel, next to **PR**, shown for tickets linked to a Notion page
  only (`originKind === 'notion'`, the page id in `originId`: imported, created as a page, or linked later from the
  Overview's Notion row). It lists the page's open discussions, oldest first: page comments, then inline ones under
  the text they are anchored to (a quote of the commented span). Each comment shows its author, time and text
  (Notion's rich text as markdown: bold, code, links, mentions). A **Refresh** button reads them again; the tab
  reads them once per opening, like the PR discussion.
- **Reply**: each discussion has a **Reply** box; the bottom of the tab has **New comment** (a page-level
  discussion). Sending queues a command; the worker posts the comment to Notion and logs an event; the tab shows
  "Sending…" until the event arrives, then reads the discussion again.
- **Send to the implementer as a review comment**: each discussion has **Add to review**, like a PR comment's
  (`note-card.tsx`). It becomes a general draft of the ticket's review (Review changes), editable there, and
  leaves for the implementer with the other comments on the next **Send review**. Added ones show "In the review".

Only the ticket's own page. Resolved discussions are not shown (the API does not return them, see below).

The list of discussions is one component, also used read only under each page's text in a review's Notion tab
(`review-notion-tab.tsx`): that is D6 of [Link a review to its Notion page](review-notion-link.md), which waits on
this plan.

## Notion API (checked against real pages, 2026-11-05)

- `GET /v1/comments?block_id=<id>&page_size=100` (cursor paging) lists the **unresolved** comments of a page
  (`block_id` = the page id) or of one block (inline comments). Resolved threads are never returned. The page's
  list also holds comments on a **whole block** (parent `block_id`, no span in the markdown): they show with no
  quote, after the inline ones. A comment read from the page and from its block is kept once.
- A comment has `id`, `discussion_id`, `parent` (`page_id` or `block_id`), `created_by` (a user id only),
  `created_time`, `rich_text` (a user mention's `plain_text` is `@Name`; a page mention has its `href`),
  `display_name` (`{ type: 'user', resolved_name }`).
- `POST /v1/comments` with `discussion_id` replies in a thread; with `parent: { page_id }` it starts a page-level
  discussion. Starting a new **inline** discussion (on a span of text) is not offered by the API: Union does not
  try.
- The integration needs the **Read comments** and **Insert comments** capabilities (integration settings →
  Capabilities). Without them, reads and writes answer 403: the tab and the failed event say which capability is
  missing, as `routes/pr-checks.ts` does for the GitHub App.
- Authors: `display_name.resolved_name`, the name Notion shows; no `users()` lookup, so no "Read user
  information" capability. An empty name shows as "Notion user".
- Which blocks to read: the page markdown (`GET /v1/pages/{id}/markdown`, already used at import) marks commented
  spans with `discussion-urls="discussion://<page>/<block>/<discussion>"`, one span per run of marks (a commented
  sentence with a bold word is three spans): the quote joins their text. Spans of **resolved** discussions stay in
  the markdown: their block is read and answers nothing. The read takes the **current** markdown
  (not the ticket body, a snapshot of the import), collects the block ids, and lists the comments of the page and
  of each of those blocks. The span's text is the quote shown above the discussion. Notion allows 3 requests a
  second: blocks are read in order, capped (`MAX_COMMENT_BLOCKS`, 30), and the tab says when it
  stopped at the cap.

## Decisions (confirmed 2026-11-05)

- **D1. Where they show.** A **Notion** section tab, enabled only for a ticket linked to a Notion page
  (`sectionsFor` already has `enabled`; today every entry passes `true`), rather than under the description on
  Overview: Overview stays short, and the tab mirrors PR (discussion, replies, later picks). The Overview's Notion
  row (`ticket-notion-row.tsx`) shows "· N open discussions" linking to the tab when the count is known (only once the
  tab has been read; no read on Overview).
- **D2. Who the reply is from.** Notion shows comments posted through an internal integration under the
  integration's name. Union posts with
  `display_name: { type: 'custom', custom: { name: '<GitHub login> via Union' } }` if the API version accepts it
  for internal integrations, else under the integration's name with no prefix. No "Posted from Union" footer in
  the text.
- **D3. Writing is a worker command.** Replies and new comments are Notion writes: the web queues
  `post_notion_comment` (`{ projectId, pageId, discussionId | null, text }`), the worker posts. Same pattern as the
  PR comment replies (`reply_pr_comment`: payload type and parser in core, the web's queue and pending read, the
  worker's poster, which the event names by command id). The command row holds the text until the worker posts it,
  which is what the tab shows as "Sending…" (survives a reload). No local table of comments: Notion is the record.
- **D4. Text format.** The reply box takes plain text with markdown links, `**bold**`, `` `code` `` and line
  breaks; a pure converter turns it into Notion rich text (2000 characters per text object: split longer runs).
  Anything else stays literal. Length capped (`MAX_NOTION_COMMENT`, a named constant), refused by the web route
  before queueing.
- **D5. Tickets created from an investigation as a Notion page** (`ticketInNotion`) are linked to their page like
  imported ones: they get the tab, and so does a ticket linked to a page after creation. Tickets whose project lost
  its Notion secret get the tab, which says "This project is not connected to Notion" (the route's answer):
  a disabled tab could not say why.

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

- `notion-api.ts` (222 lines): add `comments(token, blockId): Promise<NotionComment[]>` (all pages of the cursor)
  and `addComment(token, target: { discussionId } | { pageId }, richText, displayName): Promise<NotionComment>` to
  `NotionApi`. Parsing the comment objects goes in a new `notion-comment-parse.ts` so `notion-api.ts` stays under
  300 lines. `NotionComment = { id, discussionId, blockId: string | null, author, createdAt, richText }`.
  **Built:** `comments` (and a `listAll` paging helper `users` now shares) and the parsing; `addComment` comes
  with step 3.
- `notion-comments.ts` (new, pure, browser-safe): `commentedSpans(markdown)` (discussion → block and quote, in
  page order), `discussionsOf(comments, spans)` (dedupe, group by `discussion_id`, oldest first; page ones first,
  then those on the text in page order, then those on whole blocks), `richTextMarkdown(richText)` (marks and
  links to markdown, spaces kept outside the marks). **Built**, with tests.
- `notion-rich-text.ts` (new, pure): `toRichText(text)` for D4, with tests (links, bold, code, splitting at 2000).
- `notion-comment-post.ts` (new, beside `pr-comment-reply.ts`): the `post_notion_comment` payload type and its
  parser (`notionCommentOf`), used by the web to queue and by the worker to read.
- `event-payloads.ts` (235 lines): both on the ticket,
  `notion_comment_posted: { commandId: number; discussionId: string; commentId: string }` and
  `notion_comment_failed: { commandId: number; discussionId: string | null; text: string; error: string }`. Log
  lines in the worker render; `notion_comment_failed` becomes a notification (Notifications plan: failures need
  you).

## Web (`apps/web`)

- `routes/notion-comments.ts` (new), mounted under `/api/tickets/:id/notion-comments`:
  - `GET`: refuses tickets not linked to a Notion page or a project without a Notion secret; reads the page
    markdown, the comments of the page and the commented blocks; answers `{ discussions, truncated }`
    with the pending replies (queued `post_notion_comment` commands of the ticket) beside them. `NotionError` 403 →
    the capabilities message. The token and the guard come from `routes/notion.ts` (`notionTokenOf`, `guarded`), as
    `ticket-notion-link.ts` and `review-notion.ts` do.
  - `POST`: `{ discussionId?: string, text }`; checks the length and that the ticket has a page; inserts the
    command (in `notion-comment-commands.ts`, as `pr-reply-commands.ts`). Returns 202.
- The read of the discussions (markdown, comments) is a function the review's Notion route can call for
  each linked page later (`review-notion.ts`).
- `notion-discussion-types.ts` (browser-safe, as `review-notion-types.ts`): `NotionDiscussionsView`
  (`{ pageUrl, discussions, truncated }`), `NotionDiscussionView` (`place: 'page' | 'text' | 'block'`, `quote`,
  `url` with `?d=<discussion>`), `NotionCommentView` (author, time, markdown).
- **Built (step 2):** `routes/notion-comments.ts` (`GET` only, mounted by `ticket-outside-links.ts`, the ticket
  loader shared with `ticket-notion-link.ts`), `notion-discussions.ts` (`readDiscussions(notion, token, page)`,
  for the review's tab later; 403 → "turn on Read comments"), tests in `notion-comments.test.ts`.
- The fake `NotionApi` in the web tests gets `addComment` (`comments` was added in step 1).
- `notion-comments.ts` gets a `./notion-comments` entry in core's `package.json` exports for the client.

## Client (`apps/web/client`)

- `ticket-tabs.tsx` (162 lines): `Section` gets `'notion'`; `sectionsFor` adds it, enabled by
  `ticket.originKind === 'notion' && ticket.originId !== null`; `PanelBody` renders `NotionTab`.
- `components/notion/notion-tab.tsx`: Refresh, the discussions, New comment, the truncated note, errors.
- `components/notion/notion-discussion.tsx`: the quote (inline ones), the comments (`folded-markdown.tsx` for the
  text, as the review's Notion tab does), the reply box, the pending reply.
- **Built (step 2):** the tab and the discussion card (read only: no Reply, no Add to review yet), the `5`
  shortcut (inactive without a page), "· N open discussions" on the Overview's Notion row from the tab's cached
  read (Overview's `onOpenPreview` became `onOpenTab`). Checked in the browser on ticket 18 with its real
  discussions, every write blocked.
- `lib/use-notion-comments.ts`: the query, the mutation, and `useEvents` on `notion_comment_posted` / `_failed`
  for this ticket to refetch (as the PR replies' pending state does).

## Worker (`apps/worker`)

- `notion-comment-post.ts` (new, as `github/pr-comment-reply.ts`): reads the ticket and project, resolves the
  display name (D2), converts the text (D4), calls `addComment`, emits `notion_comment_posted` or
  `notion_comment_failed` (403 → the capability name; 404 → "the discussion was resolved or deleted").
- `commands.ts` (303 lines): one `post_notion_comment` entry in the handler table calling a hook
  (`postNotionComment(command.id, notionCommentOf(command.payload))`), declared in `command-hooks.ts`.
- No retry loop: a failed post is shown and the user sends again (the text is kept in the failed event and put
  back in the box).

## Steps

1. Core reads: `comments`, the parsing, `notion-comments.ts` with tests (fixtures from a real page, ids
   replaced). **Built** (2026-11-05). On ticket 18's page: 1 page discussion (9 comments), 7 inline ones with their
   quotes, 1 on a whole block, 2 resolved spans that read nothing.
2. Web `GET` route and the read-only Notion tab; check it against a real Notion ticket (read only). **Built**
   (2026-11-05). Docs: the guide's ticket panel and shortcuts, `docs/spec/flow.md`, `integrations.md`.
3. Replies: `toRichText`, the command, the worker handler, events, the reply box and New comment. Check on a
   **test page** of the data source the user picks (posting on a real ticket's page is a write the user approves
   first). **Built** (2026-11-05): checked by posting a page comment and a reply in its thread on ticket 26's page
   (approved; the user deletes them), read back with their marks; the tab's reply box checked in the browser with
   the POST answered by the check. Changes: comments post under the integration's name (D2's fallback: Union
   keeps no GitHub login of the user to put in a custom name); `notion_comment_failed` is not a notification yet;
   the worker's poster is `notion/comment-post.ts` (with `notionHooks`), the client's box `notion-reply.tsx`,
   reusing the PR tab's `reply-box.tsx`; `MAX_NOTION_COMMENT` is 4000 and a comment has at most 100 text runs.
4. Add to review (D6): the `source_url` rename, `importNotionDiscussion` beside `importNote` in
   `apps/web/src/review-import.ts` (173 lines; a new `notion-review-import.ts` if it passes 300),
   `POST /api/tickets/:id/notion-comments/import` (`{ discussionId }`, reads the discussion fresh from Notion),
   the heading in `review-feedback.ts` with a test, the button and "In the review" state in the tab (the `GET`
   answers the imported discussion ids, as `importedUrls` does). Later, if wanted: the same text as a planning
   step's "Request changes". **Built** (2026-11-05): migration `0079_review_source_url` (a
   rename, rows kept), `notion-review-import.ts` (one general draft, deduped by
   `https://www.notion.so/<page>?d=<discussion>`), the route, the heading, `markSent` asking no GitHub reply for a
   Notion draft, the card's "on Notion" link; the button and "In the review" checked in the browser with the import
   answered by the check. Changes: the button is offered once the ticket has a branch (and its pull request is not
   merged), since a draft can wait for Send review; a general draft keeps no head (never outdated).
5. The review's Notion tab (D6 of review-notion-link): the discussions under each linked page's text, read only,
   from the same read and component. **Built** (2026-11-05): `GET <review>/notion` gives each page its
   `discussions` (or the reason they could not be read; the text still shows), pages read one at a time;
   `NotionDiscussion` read only without `actions`. Checked in the browser with stubbed reads.
6. Optional: a `notion_comment_added` trigger for rules and notifications, from a poll in the worker (Notion has no
   webhook for internal integrations without a public URL). Only if step 4 shows it is wanted.

## Docs to update when built

- `docs/architecture/integrations.md`: the comment read (web) and write (worker), the two capabilities.
- `docs/architecture/web.md`, `worker.md`: the route, the command.
- Onboarding Notion step and Notion settings: say the integration needs Read and Insert comments.
- `docs/spec/`: the ticket panel's tabs. `documentation/`: the guide's ticket panel page (the Notion tab, replying,
  Add to review) and the Notion setup page (the two capabilities).
