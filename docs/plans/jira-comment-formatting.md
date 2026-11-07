# Formatted Jira comments

Status: planned (2026-11-07). Follows [Jira comments on the ticket](jira-comments.md) and [Create Jira issues from
investigations](jira-create-issues.md), built: the second brought `markdownAdf`, a markdown to Jira rich text
converter.

## Why

A comment posted from a ticket's Jira tab is plain text: only bare links become links (`text-adf.ts`). Notion's tab
takes `**bold**`, `` `code` `` and `[links](https://…)`; a reply about code ("the fix is in `auth.ts`") reads worse
in Jira than in Notion, and a list of steps loses its shape. The converter that turns an agent's markdown into an
issue's description now exists: comments can use it.

## What the user gets

- In the Jira tab, a comment or reply is markdown: bold, italic, `code`, links, lists, code blocks, quotes. The box
  says so ("Markdown: **bold**, `code`, [links](https://…), lists"), as Notion's does.
- A reply still starts with the mention of the author.
- Rule comments ("Comment on the ticket's Jira issue") are unchanged: plain text, links made links (D2).

## Decisions

- **D1. `markdownAdf` with a leading mention.** The worker's `jira/comment-post.ts` converts the text with
  `markdownAdf`; a reply puts the mention and a space at the start of the first paragraph (a first block that is
  not a paragraph, a list for example, gets a paragraph with the mention before it). `textAdf`'s mention moves to a
  helper both use.
- **D2. Rule comments stay plain text.** A rule's text was written as plain text: `*`, `_` or `#` in it would
  change meaning. A rule could opt in later ("Markdown" switch on the action); not now.
- **D3. Same limits.** A comment over 32 767 characters is refused as now; Jira's rich text has no bold code, so the
  converter's rule (code keeps only a link) applies, as in descriptions.
- **D4. The tab shows what was sent as Jira shows it.** "Sending to Jira…" shows the text as markdown (rendered),
  since that is what the comment becomes.

## Steps

1. **The post.** D1 in the worker, `ADF` types shared (`adf-types.ts`'s document for both `addComment` and
   `createIssue`); tests: a reply with a mention before a paragraph and before a list, code, a link.
2. **The tab.** The box's hint, the pending comment rendered (D4). UI check with the post stubbed; a real comment on
   the user's SCRUM-1 after asking.
3. **Docs.** `documentation/tickets.md` (the Jira tab: what a comment can hold), this plan's status.
